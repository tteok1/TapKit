# IANA

## 问题与范围

用途：形成可核查的研究报告

范围：公开匿名网页；核对IANA互联网资源职责与不同来源的陈述及局限

研究状态：部分成果；存在未覆盖或未充分核验的问题

## 结论与依据

### What resources does IANA coordinate?

**原文陈述（逐字核验）**：Management of the DNS Root Zone (assignments of ccTLDs and gTLDs) along with other functions such as the .int and .arpa zones.

核验缺口：此条原文陈述仅有一个来源组支持，尚未逐条交叉核验。

支持 [1]（字符 14–140）：

> Management of the DNS Root Zone (assignments of ccTLDs and gTLDs) along with other functions such as the .int and .arpa zones.

**原文陈述（逐字核验）**：互联网由各自独立的网络组成，却需要使用同一套名称、号码和协议标识。IANA 负责协调这些标识，让不同网络能够准确地识别彼此。对 ISP、云平台和托管服务商来说，这套共同记录是客户连接的基础；真正把地址接入网络、把服务交付给客户，则是运营商和地址供应商的工作。

核验缺口：此条原文陈述仅有一个来源组支持，尚未逐条交叉核验。

支持 [2]（字符 8–137）：

> 互联网由各自独立的网络组成，却需要使用同一套名称、号码和协议标识。IANA 负责协调这些标识，让不同网络能够准确地识别彼此。对 ISP、云平台和托管服务商来说，这套共同记录是客户连接的基础；真正把地址接入网络、把服务交付给客户，则是运营商和地址供应商的工作。

## 方法与局限

实际搜索 1 次，本轮实际读取 2 次。只把已读取、固定版本且未被排除的原文作为依据。

搜索候选不是引用证据；逐字核验只能证明来源如此陈述，不能自动证明陈述为真。推断与冲突仍需核查。发布日期未知时不能声称满足日期筛选。相同主域名不视为不同来源；不同域名或文件身份也不自动证明发布者独立。每个问题不足两个不同来源时保留为部分成果。

时间范围：不限起日 至 不限止日。

## 来源清单

1. Internet Assigned Numbers Authority
   来源：https://www.iana.org/
   访问/固定时间：2026-11-03T12:32:57.035Z；网页声明发布日期：未知。
   状态：ready；内容SHA256：81b0bb6cbb2631c03aaa95c60efc27e88afbaba7c230e901531e785f0716824b。

2. 什么是 IANA：互联网号码分配机构 - LARUS
   来源：https://larus.net/cn/blog/what-is-iana/
   访问/固定时间：2026-11-03T12:33:04.663Z；网页声明发布日期：2026-08-18T08:15:46.000Z。
   状态：ready；内容SHA256：8695605b076e8e7ac91cf27ab5c9170cde13bd63b0abf9bc3182bdbd1ad6a666。
