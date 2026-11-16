'use client';
import { useRef, useState } from 'react';
import type { Deal } from '../../domain/model';
export function useKanbanDrag(
  deals: Deal[],
  busy: boolean,
  onStage: (deal: Deal, stage: string) => void,
) {
  const dragRef = useRef<{ id: string; x: number; y: number; active: boolean } | null>(null),
    suppressClick = useRef(false);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null),
    [dropStage, setDropStage] = useState('');
  function cancelDrag() {
    dragRef.current = null;
    setDrag(null);
    setDropStage('');
    setTimeout(() => {
      suppressClick.current = false;
    }, 0);
  }
  function pointerDown(e: React.PointerEvent<HTMLButtonElement>, d: Deal) {
    if (busy || e.button !== 0) return;
    if (e.pointerType !== 'mouse' && !(e.target as HTMLElement).closest('.draggrip')) return;
    dragRef.current = { id: d.id, x: e.clientX, y: e.clientY, active: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function pointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const r = dragRef.current;
    if (!r) return;
    if (!r.active && Math.hypot(e.clientX - r.x, e.clientY - r.y) < 7) return;
    r.active = true;
    suppressClick.current = true;
    setDrag({ id: r.id, x: e.clientX, y: e.clientY });
    const col = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest<HTMLElement>('[data-stage]');
    setDropStage(col?.dataset.stage || '');
    const board = e.currentTarget.closest('.kanban');
    if (board) {
      const rect = board.getBoundingClientRect();
      if (e.clientX > rect.right - 45) board.scrollLeft += 18;
      else if (e.clientX < rect.left + 45) board.scrollLeft -= 18;
    }
  }
  function pointerUp(e: React.PointerEvent<HTMLButtonElement>) {
    const r = dragRef.current;
    const target = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest<HTMLElement>('[data-stage]')?.dataset.stage;
    e.currentTarget.releasePointerCapture(e.pointerId);
    cancelDrag();
    if (r?.active) {
      suppressClick.current = true;
      setTimeout(() => {
        suppressClick.current = false;
      }, 0);
      const d = deals.find((d) => d.id === r.id);
      if (d && target) void onStage(d, target);
    }
  }
  return { drag, dropStage, suppressClick, cancelDrag, pointerDown, pointerMove, pointerUp };
}
