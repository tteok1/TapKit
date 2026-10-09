import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { HelperRequestSchema } from '../../packages/contracts/src';
import { prepareOfficeProfile, runtimePaths } from '../../packages/tools/src/execution';
import { NativeSandboxExecutor } from '../../packages/tools/src/execution/native-executor';
import { securityMarkers } from '../../scripts/fixtures-office-security.mjs';

const exec = promisify(execFile);
const id = () => {
  const value = randomUUID();
  return value.slice(0, 14) + '7' + value.slice(15);
};

export async function recordOfficePdf(root: string, name: string, bytes: Buffer) {
  const directory = join(root, 'test-results/P00-03-office');
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, name + '.pdf'), bytes);
}

export async function pdfText(root: string, bytes: Buffer) {
  const require = createRequire(join(root, 'packages/retrieval/package.json'));
  const { getDocument } = await import(
    pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href
  );
  const loading = getDocument({ data: new Uint8Array(bytes), useSystemFonts: false });
  try {
    const document = await loading.promise;
    const pages: string[] = [];
    for (let page = 1; page <= document.numPages; page++) {
      const content = await (await document.getPage(page)).getTextContent();
      pages.push(content.items.map((item: { str?: string }) => item.str ?? '').join(' '));
    }
    return pages.join('\n');
  } finally {
    await loading.destroy();
  }
}

/** Test-only positive controls. Payloads run under the same real AppContainer/ACL/Job limits. */
export async function officeControl(
  root: string,
  inputRoot: string,
  workspace: string,
  filename: string,
  mode: 'macro' | 'links',
) {
  const runtime = await runtimePaths(root, 'libreoffice');
  const mappingScript = join(root, 'tests/fixtures/office-control-mappings.ps1');
  const journal = join(workspace, 'control-mappings.json');
  const mappingArgs = ['-NoProfile', '-NonInteractive', '-File', mappingScript];
  const runId = id();
  await prepareOfficeProfile(workspace);
  try {
    const created = await exec(
      'pwsh.exe',
      [
        ...mappingArgs,
        '-Operation',
        'create',
        '-Journal',
        journal,
        '-RuntimeRoot',
        runtime.runtimeRoot,
        '-Workspace',
        workspace,
        '-InputRoot',
        inputRoot,
      ],
      { cwd: root, windowsHide: true },
    );
    const mappings = JSON.parse(created.stdout) as Array<{ drive: string; target: string }>;
    if (mappings.length !== 3) throw new Error('OFFICE_CONTROL_MAPPINGS_INVALID');
    const aliases = mappings.map(({ drive }) => drive + '\\');
    const profilePath = join(workspace, 'office-profile/user/registrymodifications.xcu');
    const profile = await readFile(profilePath, 'utf8');
    await writeFile(
      profilePath,
      profile
        .replace('<value>3</value>', '<value>0</value>')
        .replace('<value>true</value>', '<value>false</value>')
        .replace(
          '</oor:items>',
          '<item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="SecureURL" oor:op="fuse"><value>' +
            [inputRoot, aliases[2]!]
              .map(
                (path) =>
                  '<it>' +
                  pathToFileURL(path).href.replaceAll('&', '&amp;') +
                  (path.endsWith('\\') ? '' : '/') +
                  '</it>',
              )
              .join('') +
            '</value></prop></item></oor:items>',
        ),
    );
    let script = await readFile(join(root, 'native/windows-helper/src/lok_worker.py'), 'utf8');
    if (mode === 'macro') {
      if (!script.includes('b"MacroSecurityLevel=3,EnableMacrosExecution=false"'))
        throw new Error('OFFICE_CONTROL_SOURCE_CHANGED');
      script = script.replace(
        'b"MacroSecurityLevel=3,EnableMacrosExecution=false"',
        'b"MacroSecurityLevel=0,EnableMacrosExecution=true"',
      );
    }
    {
      // Both positive controls use explicit UNO loader modes on the VCL loop.
      // LOK options alone did not reliably execute the fixture's OnLoad macro.
      const start = script.indexOf('def convert():');
      const end = script.indexOf('\nworker = threading.Thread', start);
      if (start < 0 || end < 0) throw new Error('OFFICE_CONTROL_SOURCE_CHANGED');
      script =
        script.slice(0, start) +
        `def convert():
    component = None
    desktop = None
    context = None
    frame = None
    dispatcher = None
    toolkit = None
    try:
        if threading.current_thread() is not threading.main_thread():
            raise RuntimeError("OFFICE_CONTROL_NOT_ON_MAIN_LOOP")
        import uno
        context = uno.getComponentContext()
        desktop = context.ServiceManager.createInstanceWithContext("com.sun.star.frame.Desktop", context)
        def prop(name, value):
            item = uno.createUnoStruct("com.sun.star.beans.PropertyValue")
            item.Name = name
            item.Value = value
            return item
        component = desktop.loadComponentFromURL(source.resolve().as_uri(), "_blank", 0, (
            prop("Hidden", ${mode === 'macro' ? 'False' : 'True'}), prop("UpdateDocMode", ${mode === 'links' ? 3 : 0}), prop("MacroExecutionMode", ${mode === 'macro' ? 4 : 0})))
        if not component:
            raise RuntimeError("OFFICE_CONTROL_LOAD_FAILED")
        ${
          mode === 'macro'
            ? `# Pinned LO 26.2.6.3 objmisc.cxx PostActivateEvent_Impl suppresses OnLoad
        # for Hidden documents. Allow the real document event in the headless LOK
        # instance; do not invoke a script or synthesize the marker from Python.
        event = component.Events.getByName("OnLoad")
        emit("control_macro_binding", script=[p.Value for p in event if p.Name == "Script"], hidden=False)
        toolkit = context.ServiceManager.createInstanceWithContext("com.sun.star.awt.Toolkit", context)
        deadline = time.monotonic() + 5
        cell = component.Sheets.getByIndex(0).getCellRangeByName("A1")
        while cell.String != ${JSON.stringify(securityMarkers.macroExecuted)} and time.monotonic() < deadline:
            # Deliver the queued OnLoad notification before checking its side effects.
            toolkit.reschedule()
            time.sleep(0.01)
        value = cell.String
        emit("control_macro_loaded", value=value, macroExecutionMode=4)
        cell = None
        if value != ${JSON.stringify(securityMarkers.macroExecuted)}:
            raise RuntimeError("OFFICE_CONTROL_MACRO_NOT_EXECUTED")`
            : `def snapshot(stage):
            cell = component.Sheets.getByIndex(0).getCellRangeByName("A1")
            emit(stage, value=cell.String, formula=cell.getFormula(), cellError=cell.getError(),
                 allowLinkUpdate=component.AllowLinkUpdate,
                 externalLinkCount=component.ExternalDocLinks.getCount(),
                 sourceExists=(input_root / "external-source.xlsx").is_file())
            return cell.String
        snapshot("control_loaded")
        # calculateAll only recalculates formulas; it does not reload external caches.
        # FULL_UPDATE permits the synchronous UpdateTableLinks dispatch to reload them.
        frame = component.getCurrentController().getFrame()
        dispatcher = context.ServiceManager.createInstanceWithContext("com.sun.star.frame.DispatchHelper", context)
        dispatcher.executeDispatch(frame, ".uno:UpdateTableLinks", "", 0, ())
        snapshot("control_links_refreshed")
        component.calculateAll()
        value = snapshot("control_updated")
        if value != ${JSON.stringify(securityMarkers.linkUpdated)}:
            raise RuntimeError("OFFICE_CONTROL_LINK_NOT_UPDATED")`
        }
        component.storeToURL(output.resolve().as_uri(), (prop("FilterName", "calc_pdf_Export"),))
        emit("control_saved", bytes=output.stat().st_size)
    except BaseException as error:
        failures.append(str(error) or type(error).__name__)
        emit("control_failed", error=failures[-1])
    finally:
        if component:
            component.close(True)
            emit("control_closed")
        # PyUNO proxies release native UNO references during Python deallocation.
        # Release every local proxy while the office/event loop still exists.
        toolkit = dispatcher = frame = component = desktop = context = None
        emit("control_references_released")
        method(kit, 1, None, c.c_void_p)(kit)
        emit("control_destroyed")
        wake.set()
        emit("control_worker_complete")
` +
        script.slice(end);
      // Capture Python stacks if native shutdown stalls, keeping all original limits.
      script = script.replace(
        'worker = threading.Thread',
        'import faulthandler\nfaulthandler.dump_traceback_later(20, repeat=True)\nworker = threading.Thread',
      );
      // PyUNO document calls belong on the VCL message loop. The Python worker
      // only queues the callback after runLoop starts; it no longer performs
      // document loading/recalculation/close concurrently with that loop.
      // AsyncCallback retains the callback until invocation, so release the
      // scheduling proxies before conversion destroys the LOK instance.
      script = script.replace(
        'worker = threading.Thread(target=convert,',
        `def schedule_control():
    context = callback_service = None
    try:
        time.sleep(2)
        import uno
        import unohelper
        from com.sun.star.awt import XCallback
        class ControlCallback(unohelper.Base, XCallback):
            def notify(self, _data):
                emit("control_callback_started", mainThread=threading.current_thread() is threading.main_thread())
                convert()
        context = uno.getComponentContext()
        callback_service = context.ServiceManager.createInstanceWithContext("com.sun.star.awt.AsyncCallback", context)
        callback_service.addCallback(ControlCallback(), None)
        callback_service = context = None
        emit("control_callback_queued")
    except BaseException as error:
        failures.append(str(error) or type(error).__name__)
        emit("control_schedule_failed", error=failures[-1])
        method(kit, 1, None, c.c_void_p)(kit)
        wake.set()
    finally:
        callback_service = context = None

worker = threading.Thread(target=schedule_control,`,
      );
      script = script.replace('worker.join(5)', 'emit("control_loop_returned")\nworker.join(5)');
      // CI run 37277722714 reached finished/ok but never exited. Distinguish
      // ctypes teardown and Python atexit from the already-completed LOK loop.
      script = script.replace(
        'import faulthandler',
        'import atexit\natexit.register(lambda: emit("control_python_atexit"))\nimport faulthandler',
      );
      script = script.replace(
        'del library',
        'emit("control_library_release_begin")\ndel library\nemit("control_library_released")',
      );
      script = script.replace(
        'del dll_directory',
        'emit("control_dll_directory_release_begin")\ndel dll_directory\nemit("control_dll_directory_released")',
      );
    }
    const request = HelperRequestSchema.parse({
      protocolVersion: 1,
      requestId: id(),
      runId,
      leaseEpoch: 1,
      operation: 'diagnostic.execute',
      payload: {
        ...runtime,
        executable: join(runtime.runtimeRoot, 'program/python.exe'),
        inputRoot,
        workspace,
        args: ['-c', script, ...aliases, filename],
        timeoutMs: 120_000,
        terminal: false,
      },
    });
    const result = await new NativeSandboxExecutor(root).execute(request);
    await appendFile(
      join(root, 'docs/evidence/P00-03/native-cases.jsonl'),
      JSON.stringify({ case: 'office-control-' + mode, runId, events: result.events }) + '\n',
    );
    const started = result.events[0];
    const finished = result.events.at(-1);
    if (
      result.exitCode !== 0 ||
      started?.event !== 'started' ||
      started.data.appContainer !== true ||
      started.data.networkCapabilities !== 0 ||
      finished?.event !== 'finished' ||
      finished.data.status !== 'exited' ||
      finished.data.exitCode !== 0 ||
      finished.data.activeProcesses !== 0
    )
      throw new Error('OFFICE_CONTROL_FAILED: ' + JSON.stringify(finished?.data));
    return await readFile(join(workspace, filename.replace(/\.[^.]+$/, '.pdf')));
  } finally {
    const exists = await readFile(journal).then(
      () => true,
      (error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error;
        return false;
      },
    );
    if (exists)
      await exec('pwsh.exe', [...mappingArgs, '-Operation', 'remove', '-Journal', journal], {
        cwd: root,
        windowsHide: true,
      });
  }
}
