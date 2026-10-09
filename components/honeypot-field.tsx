import { HONEYPOT_ID } from "@/lib/bot-guard-client";

// Pole-pułapka dla botów — niewidoczne i pomijane przez czytniki ekranu oraz autouzupełnianie.
export function HoneypotField() {
  return (
    <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
      <label htmlFor={HONEYPOT_ID}>Nie wypełniaj tego pola</label>
      <input id={HONEYPOT_ID} type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
    </div>
  );
}
