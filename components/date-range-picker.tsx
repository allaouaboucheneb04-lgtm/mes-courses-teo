"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type DateRangePickerProps = {
  open: boolean;
  start: string;
  end: string;
  onClose: () => void;
  onApply: (start: string, end: string) => void;
};

const parseDate = (value: string) => new Date(value + "T12:00:00");
const formatShort = (value: string) =>
  new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "short" }).format(parseDate(value));
const formatLong = (value: string) =>
  new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "long", year: "numeric" }).format(parseDate(value));
const formatMonth = (year: number, month: number) =>
  new Intl.DateTimeFormat("fr-CA", { month: "long", year: "numeric" }).format(new Date(year, month, 1));
const keyOf = (year: number, month: number, day: number) =>
  String(year) + "-" + String(month + 1).padStart(2, "0") + "-" + String(day).padStart(2, "0");

export function DateRangeField({
  start, end, onClick
}: {
  start: string;
  end: string;
  onClick: () => void;
}) {
  return (
    <div className="date-range-field">
      <span className="date-range-field-label">Dates sélectionnées</span>
      <button type="button" className="date-range-trigger" onClick={onClick}
        aria-label={"Modifier la période du " + formatLong(start) + " au " + formatLong(end)}>
        <span aria-hidden="true" className="date-range-trigger-icon">▦</span>
        <span>{formatShort(start)} – {formatShort(end)}</span>
        <span aria-hidden="true" className="date-range-trigger-chevron">⌄</span>
      </button>
    </div>
  );
}

export default function DateRangePicker({ open, start, end, onClose, onApply }: DateRangePickerProps) {
  const [draftStart, setDraftStart] = useState(start);
  const [draftEnd, setDraftEnd] = useState<string | null>(end);
  const listRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const months = useMemo(() => {
    const anchor = /^\d{4}-\d{2}-\d{2}$/.test(start) ? parseDate(start) : new Date();
    // Calendar months before and after the selected period, vertically scrollable.
    return Array.from({ length: 73 }, (_, index) => {
      const date = new Date(anchor.getFullYear(), anchor.getMonth() + index - 48, 1);
      return { year: date.getFullYear(), month: date.getMonth(), id: keyOf(date.getFullYear(), date.getMonth(), 1).slice(0, 7) };
    });
  }, [start]);

  useEffect(() => {
    if (!open) return;
    setDraftStart(start);
    setDraftEnd(end);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const frame = requestAnimationFrame(() => {
      const container = listRef.current;
      const section = container?.querySelector<HTMLElement>('[data-month="' + start.slice(0, 7) + '"]');
      if (container && section) {
        container.scrollTop = Math.max(0, section.offsetTop - container.offsetTop - 16);
      }
      closeRef.current?.focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, start, end, onClose]);

  if (!open || typeof document === "undefined") return null;

  const pick = (value: string) => {
    if (!draftStart || draftEnd) {
      setDraftStart(value);
      setDraftEnd(null);
    } else if (value < draftStart) {
      setDraftEnd(draftStart);
      setDraftStart(value);
    } else {
      setDraftEnd(value);
    }
  };

  const title = draftStart
    ? formatShort(draftStart) + " – " + (draftEnd ? formatShort(draftEnd) : "Date de fin")
    : "Date de début – Date de fin";

  return createPortal(
    <div className="date-range-overlay">
      <div className="date-range-backdrop" onClick={onClose} aria-hidden="true" />
      <section className="date-range-sheet" role="dialog" aria-modal="true"
        aria-labelledby="date-range-picker-title">
        <header className="date-range-sheet-head">
          <div className="date-range-sheet-actions">
            <button type="button" className="date-range-close" aria-label="Fermer sans appliquer"
              ref={closeRef} onClick={onClose}>×</button>
            <button type="button" className="date-range-apply"
              disabled={!draftStart || !draftEnd}
              onClick={() => {
                if (draftStart && draftEnd) onApply(draftStart, draftEnd);
              }}>Appliquer</button>
          </div>
          <p id="date-range-picker-title">Sélectionner la plage</p>
          <strong>{title}</strong>
        </header>
        <div className="date-range-weekdays" aria-hidden="true">
          {["D", "L", "M", "M", "J", "V", "S"].map((label, index) =>
            <span key={index}>{label}</span>)}
        </div>
        <div className="date-range-month-scroll" ref={listRef}>
          {months.map(({ year, month, id }) => {
            const offset = new Date(year, month, 1).getDay();
            const days = new Date(year, month + 1, 0).getDate();
            return (
              <section className="date-range-month" key={id} data-month={id}>
                <h3>{formatMonth(year, month)}</h3>
                <div className="date-range-days">
                  {Array.from({ length: offset }, (_, index) =>
                    <span className="date-range-empty" aria-hidden="true" key={"empty-" + index} />)}
                  {Array.from({ length: days }, (_, index) => {
                    const day = index + 1;
                    const key = keyOf(year, month, day);
                    const selected = key === draftStart || key === draftEnd;
                    const between = Boolean(draftEnd && key > draftStart && key < draftEnd);
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => pick(key)}
                        aria-label={formatLong(key)}
                        aria-pressed={selected}
                        className={[
                          "date-range-day",
                          selected ? "is-selected" : "",
                          between ? "is-between" : ""
                        ].filter(Boolean).join(" ")}
                      >{day}</button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
        <div className="date-range-bottom-note">
          {draftEnd ? "Période sélectionnée. Appuyez sur Appliquer." : "Touchez une date de fin, ou faites défiler les mois."}
        </div>
      </section>
    </div>,
    document.body
  );
}
