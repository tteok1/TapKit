param([switch]$OfflineCheck)

$ErrorActionPreference = 'Stop'

function Get-SafeCode($Value) {
    if ($null -eq $Value) { return $null }
    $code = [string]$Value
    if ($code -cmatch '^[A-Za-z0-9_.-]{1,80}$') { return $code }
    return $null
}

function Get-TokenCount($Value) {
    if ($null -eq $Value) { return $null }
    if (($Value -is [int] -or $Value -is [long]) -and $Value -ge 0) {
        return $Value
    }
    return $null
}

function Get-ProbeBody {
    return @{
        model = 'glm-4.7-flash'
        instructions = 'Follow the instructions.'
        input = @(@{ role = 'user'; content = 'Reply OK.' })
        stream = $true
        store = $false
        max_output_tokens = 32
        reasoning = @{ effort = 'none' }
    }
}

function Get-ResponseSummary([int]$HttpStatus, [string]$Payload) {
    $result = [ordered]@{
        httpStatus = $HttpStatus
        requestedEffort = 'none'
        requestedMaxOutputTokens = 32
        inputShape = 'message.content.string'
        responseFormat = $null
        terminalEvent = $null
        responseStatus = $null
        incompleteReason = $null
        returnedEffort = $null
        returnedMaxOutputTokens = $null
        hasText = $false
        hasReasoning = $false
        inputTokens = $null
        outputTokens = $null
        reasoningTokens = $null
        upstreamCode = $null
        parseErrors = 0
    }
    $response = $null
    if ($Payload.TrimStart().StartsWith('{')) {
        $result.responseFormat = 'json'
        try {
            $parsed = $Payload | ConvertFrom-Json
            if ($parsed.error) { $result.upstreamCode = Get-SafeCode $parsed.error.code }
            else { $response = $parsed }
        } catch { $result.parseErrors++ }
    } else {
        $result.responseFormat = 'sse'
        $normalized = $Payload.Replace("`r`n", "`n").Replace("`r", "`n")
        foreach ($block in ($normalized -split "`n`n")) {
            $data = @($block -split "`n" | Where-Object { $_.StartsWith('data:') } |
                ForEach-Object { $_.Substring(5).TrimStart(' ') }) -join "`n"
            if (-not $data -or $data -eq '[DONE]') { continue }
            try { $event = $data | ConvertFrom-Json }
            catch { $result.parseErrors++; continue }
            if ($event.type -eq 'response.output_text.delta' -and
                $event.delta -is [string] -and $event.delta.Trim().Length -gt 0) {
                $result.hasText = $true
            }
            if (($event.type -eq 'response.reasoning_text.delta' -or
                $event.type -eq 'response.reasoning_summary_text.delta') -and
                $event.delta -is [string] -and $event.delta.Length -gt 0) {
                $result.hasReasoning = $true
            }
            if ($event.type -in @('response.completed', 'response.incomplete', 'response.failed')) {
                $result.terminalEvent = $event.type
                $response = $event.response
            }
            if ($event.error) { $result.upstreamCode = Get-SafeCode $event.error.code }
        }
    }
    if ($null -ne $response) {
        $result.responseStatus = Get-SafeCode $response.status
        $result.incompleteReason = Get-SafeCode $response.incomplete_details.reason
        if ($response.reasoning.effort -in @('none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max')) {
            $result.returnedEffort = $response.reasoning.effort
        }
        $result.returnedMaxOutputTokens = Get-TokenCount $response.max_output_tokens
        $result.inputTokens = Get-TokenCount $response.usage.input_tokens
        $result.outputTokens = Get-TokenCount $response.usage.output_tokens
        $result.reasoningTokens = Get-TokenCount $response.usage.output_tokens_details.reasoning_tokens
        if ($response.error) { $result.upstreamCode = Get-SafeCode $response.error.code }
        foreach ($item in @($response.output)) {
            if ($item.type -eq 'reasoning') { $result.hasReasoning = $true }
            if ($item.type -eq 'message') {
                foreach ($content in @($item.content)) {
                    if ($content.type -eq 'output_text' -and $content.text -is [string] -and
                        $content.text.Trim().Length -gt 0) { $result.hasText = $true }
                }
            }
        }
    }
    return [pscustomobject]$result
}

if ($OfflineCheck) {
    $requestBody = Get-ProbeBody
    if ($requestBody.input[0].content -isnot [string] -or
        $requestBody.input[0].content -ne 'Reply OK.' -or
        $requestBody.reasoning.effort -ne 'none' -or $requestBody.max_output_tokens -ne 32) {
        throw 'Offline request shape fixture failed'
    }
    $secretMarker = 'DO_NOT_PRINT_PRIVATE_TEXT'
    $fixture = "data: " + (@{ type = 'response.reasoning_text.delta'; delta = $secretMarker } |
        ConvertTo-Json -Compress) + "`n`n" + "data: " + (@{
        type = 'response.incomplete'; response = @{
            status = 'incomplete'; incomplete_details = @{ reason = 'max_output_tokens' }
            usage = @{ input_tokens = 8; output_tokens = 32;
                output_tokens_details = @{ reasoning_tokens = 32 } }
        }
    } | ConvertTo-Json -Depth 8 -Compress) + "`n`n"
    $summary = Get-ResponseSummary 200 $fixture
    if ($summary.responseStatus -ne 'incomplete' -or $summary.hasText -or
        -not $summary.hasReasoning -or $summary.reasoningTokens -ne 32) {
        throw 'Offline incomplete fixture failed'
    }
    $completed = Get-ResponseSummary 200 (@{
        status = 'completed'; reasoning = @{ effort = 'none' }; max_output_tokens = 32
        output = @(@{ type = 'message'; content = @(@{
            type = 'output_text'; text = $secretMarker
        }) }); usage = @{ input_tokens = 8; output_tokens = 1;
            output_tokens_details = @{ reasoning_tokens = 0 } }
    } | ConvertTo-Json -Depth 8 -Compress)
    if (-not $completed.hasText -or $completed.reasoningTokens -ne 0 -or
        $completed.returnedEffort -ne 'none' -or $completed.returnedMaxOutputTokens -ne 32) {
        throw 'Offline completed fixture failed'
    }
    $failure = Get-ResponseSummary 429 '{"error":{"code":1305,"message":"DO_NOT_PRINT_PRIVATE_TEXT"}}'
    if ($failure.upstreamCode -ne '1305' -or $null -ne $failure.reasoningTokens) {
        throw 'Offline error fixture failed'
    }
    $invalid = Get-ResponseSummary 200 "data: INVALID`n`n"
    if ($invalid.parseErrors -ne 1 -or $null -ne $invalid.responseStatus) {
        throw 'Offline invalid fixture failed'
    }
    $safeJson = @($summary, $completed, $failure, $invalid) | ConvertTo-Json -Depth 6
    if ($safeJson.Contains($secretMarker)) { throw 'Offline privacy fixture failed' }
    Write-Output 'Offline checks passed: 4 response fixtures plus request shape; no key prompt or network request.'
    exit 0
}

# Exactly one request to the fixed official endpoint. No files, retries, or config changes.
Add-Type -AssemblyName System.Net.Http
$secureKey = Read-Host 'Zhipu API Key (hidden input; not saved)' -AsSecureString
$bstr = [IntPtr]::Zero
$key = $null
$handler = $null
$client = $null
$content = $null
$httpResponse = $null
try {
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
    $key = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    $bstr = [IntPtr]::Zero
    if ([string]::IsNullOrWhiteSpace($key)) { throw 'Empty key' }
    $handler = New-Object System.Net.Http.HttpClientHandler
    $handler.UseProxy = $false
    $handler.AllowAutoRedirect = $false
    $client = New-Object System.Net.Http.HttpClient($handler)
    $client.Timeout = [TimeSpan]::FromSeconds(120)
    $client.MaxResponseContentBufferSize = 4194304
    $client.DefaultRequestHeaders.Authorization =
        New-Object System.Net.Http.Headers.AuthenticationHeaderValue('Bearer', $key.Trim())
    $body = Get-ProbeBody | ConvertTo-Json -Depth 8 -Compress
    $content = New-Object System.Net.Http.StringContent($body, [Text.Encoding]::UTF8, 'application/json')
    $httpResponse = $client.PostAsync('https://open.bigmodel.cn/api/v1/responses', $content).
        GetAwaiter().GetResult()
    $payload = $httpResponse.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    Get-ResponseSummary ([int]$httpResponse.StatusCode) $payload | ConvertTo-Json -Depth 6
} catch {
    # Do not print exception messages, headers, response body, or private reasoning.
    [pscustomobject]@{
        diagnostic = 'transport_or_local_failure'
        exceptionType = $_.Exception.GetBaseException().GetType().Name
        automaticRetries = 0
    } | ConvertTo-Json
} finally {
    if ($bstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
    $key = $null
    $payload = $null
    if ($null -ne $httpResponse) { $httpResponse.Dispose() }
    if ($null -ne $content) { $content.Dispose() }
    if ($null -ne $client) { $client.Dispose() }
    elseif ($null -ne $handler) { $handler.Dispose() }
    if ($null -ne $secureKey) { $secureKey.Dispose() }
}
