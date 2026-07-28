export default function ThreeBodyLoader({ text = 'Please wait…', size = 64, color = '#0d9488', textClassName = 'text-slate-500' }) {
    return (
        <div className="flex flex-col items-center gap-5">
            <div className="three-body" style={{ '--uib-size': `${size}px`, '--uib-color': color }}>
                <div className="three-body__dot" />
                <div className="three-body__dot" />
                <div className="three-body__dot" />
            </div>
            {text && <p className={`text-base font-medium ${textClassName}`}>{text}</p>}
        </div>
    );
}
