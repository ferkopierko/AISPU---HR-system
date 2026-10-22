import { useRef, useState } from 'react';

/** Nahranie súboru kliknutím alebo potiahnutím. */
export default function FileDrop({ file, onChange, accept = '.pdf,.docx' }) {
  const input = useRef(null);
  const [over, setOver] = useState(false);

  function pick(files) {
    const f = files?.[0];
    if (f) onChange(f);
  }

  return (
    <div
      className={`drop${over ? ' over' : ''}${file ? ' has-file' : ''}`}
      onClick={() => input.current.click()}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files); }}
    >
      <div className="icon">{file ? '📄' : '⬆️'}</div>
      {file ? (
        <>
          <strong>{file.name}</strong>
          {(file.size / 1024).toFixed(0)} kB · kliknutím vyberiete iný súbor
        </>
      ) : (
        <>
          <strong>Pretiahnite sem svoje CV</strong>
          alebo kliknite a vyberte súbor (PDF / DOCX, max. 5 MB)
        </>
      )}
      <input ref={input} type="file" accept={accept} hidden onChange={(e) => pick(e.target.files)} />
    </div>
  );
}
