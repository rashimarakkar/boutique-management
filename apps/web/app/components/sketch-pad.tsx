'use client';
import { PointerEvent, useEffect, useRef, useState } from 'react';

type SketchPadProps = { initialSketch?: string; onChange: (sketch?: string) => void };
const colors = ['#292725', '#b88739', '#a4473d', '#4b6652'];

export function SketchPad({ initialSketch, onChange }: SketchPadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const previousPoint = useRef<{ x: number; y: number } | null>(null);
  const lastAppliedSketch = useRef<string | undefined>(undefined);
  const [color, setColor] = useState(colors[0]);
  const [width, setWidth] = useState(3);

  const context = () => canvasRef.current?.getContext('2d');
  const clearCanvas = (notify = false) => {
    const canvas = canvasRef.current; const ctx = context();
    if (!canvas || !ctx) return;
    ctx.fillStyle = '#fffdf9'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (notify) { lastAppliedSketch.current = undefined; onChange(undefined); }
  };
  useEffect(() => {
    if (lastAppliedSketch.current === initialSketch) return;
    const canvas = canvasRef.current; const ctx = context();
    if (!canvas || !ctx) return;
    lastAppliedSketch.current = initialSketch;
    clearCanvas();
    if (!initialSketch) return;
    const image = new Image();
    image.onload = () => ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    image.src = initialSketch;
  }, [initialSketch]);
  const pointFor = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!; const bounds = canvas.getBoundingClientRect();
    return { x: (event.clientX - bounds.left) * canvas.width / bounds.width, y: (event.clientY - bounds.top) * canvas.height / bounds.height };
  };
  const draw = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const ctx = context(); if (!ctx) return;
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
  };
  const finish = () => {
    if (!drawing.current || !canvasRef.current) return;
    drawing.current = false; previousPoint.current = null;
    const value = canvasRef.current.toDataURL('image/png'); lastAppliedSketch.current = value; onChange(value);
  };
  return <div className="sketch-pad">
    <div className="sketch-toolbar"><span>Pen</span>{colors.map(item => <button key={item} type="button" className={color === item ? 'chosen' : ''} style={{ background: item }} aria-label={`Use ${item} pen`} onClick={() => setColor(item)} />)}<select value={width} onChange={event => setWidth(Number(event.target.value))} aria-label="Pen width"><option value={2}>Fine</option><option value={3}>Medium</option><option value={6}>Bold</option></select><button className="clear" type="button" onClick={() => clearCanvas(true)}>Clear sketch</button></div>
    <canvas ref={canvasRef} width={900} height={560} onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); drawing.current = true; previousPoint.current = pointFor(event); }} onPointerMove={event => { if (!drawing.current || !previousPoint.current) return; const next = pointFor(event); draw(previousPoint.current, next); previousPoint.current = next; }} onPointerUp={finish} onPointerCancel={finish} />
    <p>Your sketch is included the next time you save this order.</p>
    <style jsx>{`.sketch-pad{margin-top:16px}.sketch-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px;font-size:12px;color:#6f6961}.sketch-toolbar>button:not(.clear){width:19px;height:19px;border-radius:50%;border:2px solid transparent;cursor:pointer}.sketch-toolbar .chosen{outline:2px solid #292725;outline-offset:2px}.sketch-toolbar select{width:auto;padding:5px 7px;font-size:12px}.sketch-toolbar .clear{margin-left:auto;border:0;background:none;color:#9b5146;text-decoration:underline;cursor:pointer;font-size:12px}.sketch-pad canvas{width:100%;height:auto;aspect-ratio:900/560;border:1px solid #d9d2ca;border-radius:9px;background:#fffdf9;touch-action:none;cursor:crosshair}.sketch-pad p{font-size:12px;color:#756e65;margin:8px 0 0}@media(max-width:500px){.sketch-toolbar .clear{margin-left:0;flex-basis:100%;text-align:left;padding:0}.sketch-pad canvas{min-height:230px;object-fit:fill}}`}</style>
  </div>;
}
