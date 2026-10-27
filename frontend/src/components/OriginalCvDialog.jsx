import { useEffect, useRef, useState } from 'react';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;

export default function OriginalCvDialog({ application, onClose }) {
  const dialog = useRef(null), viewport = useRef(null), canvas = useRef(null);
  const [pdf, setPdf] = useState(null), [pageNumber, setPageNumber] = useState(1);
  const [width, setWidth] = useState(600), [zoom, setZoom] = useState(1);
  const [filename, setFilename] = useState('Životopis'), [kind, setKind] = useState('loading');
  const [error, setError] = useState(''), [rendering, setRendering] = useState(false), [pageText, setPageText] = useState('');
  const source = `/api/admin/applications/${application.id}/cv`;

  useEffect(() => {
    const previous = document.activeElement;
    dialog.current.showModal();
    const observer = new ResizeObserver(entries => setWidth(entries[0].contentRect.width));
    observer.observe(viewport.current);
    return () => { observer.disconnect(); previous?.focus(); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false, loadingTask;
    async function load() {
      try {
        const response = await fetch(source, { credentials: 'include', cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error(response.status === 401 || response.status === 403
          ? 'Na zobrazenie CV sa prihláste do HR účtu.' : 'Životopis sa nepodarilo načítať.');
        const disposition = response.headers.get('Content-Disposition') || '';
        const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
        if (encoded && !cancelled) { try { setFilename(decodeURIComponent(encoded)); } catch {} }
        if (!response.headers.get('Content-Type')?.includes('application/pdf')) {
          if (!cancelled) setKind('docx');
          await response.body?.cancel();
          return;
        }
        const data = new Uint8Array(await response.arrayBuffer());
        if (cancelled) return;
        loadingTask = getDocument({ data, useSystemFonts: true, isEvalSupported: false });
        const document = await loadingTask.promise;
        if (!cancelled) { setPdf(document); setKind('pdf'); }
      } catch (err) {
        if (!cancelled) { setError(err.message || 'PDF sa nepodarilo zobraziť. Stiahnite pôvodný súbor.'); setKind('error'); }
      }
    }
    load();
    return () => { cancelled = true; controller.abort(); loadingTask?.destroy().catch(() => {}); };
  }, [source]);

  useEffect(() => {
    if (!pdf || !canvas.current) return;
    let cancelled = false, task;
    setRendering(true); setPageText('');
    async function render() {
      try {
        const page = await pdf.getPage(pageNumber);
        if (cancelled) return;
        const natural = page.getViewport({ scale: 1 });
        const fitted = Math.max(.2, (width - 32) / natural.width);
        const view = page.getViewport({ scale: fitted * zoom });
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        const target = canvas.current;
        target.width = Math.ceil(view.width * ratio); target.height = Math.ceil(view.height * ratio);
        target.style.width = `${Math.ceil(view.width)}px`; target.style.height = `${Math.ceil(view.height)}px`;
        task = page.render({ canvasContext: target.getContext('2d'), viewport: view, transform: [ratio, 0, 0, ratio, 0, 0] });
        await task.promise;
        const text = await page.getTextContent();
        if (!cancelled) {
          setPageText(text.items.map(item => (item.str || '') + (item.hasEOL ? '\n' : ' ')).join(''));
          setRendering(false);
        }
      } catch (err) {
        if (!cancelled && err.name !== 'RenderingCancelledException') {
          setError('Túto stranu sa nepodarilo zobraziť. Pôvodný súbor si môžete stiahnuť.');
          setRendering(false);
        }
      }
    }
    render();
    return () => { cancelled = true; task?.cancel(); };
  }, [pdf, pageNumber, width, zoom]);

  return <dialog className="cv-dialog" ref={dialog} aria-labelledby="cv-dialog-title" onCancel={onClose}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <header className="cv-dialog-head">
      <div><h2 id="cv-dialog-title">Originálny životopis</h2><p>{filename} · {application.candidate.email}</p></div>
      <button className="secondary" autoFocus onClick={onClose} aria-label="Zavrieť náhľad CV">Zavrieť ×</button>
    </header>
    <div className="cv-dialog-toolbar">
      {pdf && <><button className="secondary" disabled={pageNumber <= 1} onClick={() => setPageNumber(n => n - 1)} aria-label="Predchádzajúca strana">←</button>
        <span aria-live="polite">Strana {pageNumber} / {pdf.numPages}</span>
        <button className="secondary" disabled={pageNumber >= pdf.numPages} onClick={() => setPageNumber(n => n + 1)} aria-label="Nasledujúca strana">→</button>
        <label>Zväčšenie <select value={zoom} onChange={event => setZoom(Number(event.target.value))}><option value={.75}>75 %</option><option value={1}>Na šírku</option><option value={1.25}>125 %</option><option value={1.5}>150 %</option></select></label></>}
      <a className="btn secondary" href={`${source}?download=1`}>Stiahnuť originál ↓</a>
    </div>
    <div ref={viewport} className="cv-dialog-viewport">
      {kind === 'loading' && <p role="status">Načítavam pôvodný dokument…</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {kind === 'docx' && <p className="cv-docx-note">Tento životopis je vo formáte DOCX. Otvorte ho vo Worde alebo LibreOffice cez tlačidlo „Stiahnuť originál“.</p>}
      {kind === 'pdf' && <><span className="cv-render-status" role="status">{rendering ? 'Zobrazujem stranu…' : ''}</span><canvas ref={canvas} role="img" aria-label={`Originálny životopis, strana ${pageNumber} z ${pdf?.numPages}`}/></>}
    </div>
    {pageText && <details className="cv-page-text"><summary>Text tejto strany</summary><pre>{pageText}</pre></details>}
  </dialog>;
}
