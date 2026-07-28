export default function ThreeBodyLoader({ text = 'Please wait…', size = 64 }) {
    return (
        <div className="flex flex-col items-center gap-5">
            <div className="three-body" style={{ '--uib-size': `${size}px` }}>
                <div className="three-body__dot" />
                <div className="three-body__dot" />
                <div className="three-body__dot" />
            </div>
            {text && <p className="text-base font-medium text-slate-500">{text}</p>}
        </div>
    );
}
