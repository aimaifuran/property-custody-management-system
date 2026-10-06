export default function FormEditorHeader({ title, description, onClose }) {
  return <header className="form-editor-header">
    <div className="form-title-row">
      <h1 className="form-page-title">{title}</h1>
      <button type="button" onClick={onClose} className="form-title-action rounded-xl border px-3 py-2">Close Editor</button>
    </div>
    {description && <p className="form-editor-description">{description}</p>}
  </header>;
}
