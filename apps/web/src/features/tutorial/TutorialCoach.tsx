import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { subscribeToGameEvents } from '../game-session';
import { ru } from '../../shared/ui/strings';
import { LEVEL1_STEPS, type CoachStep } from './steps';

import './tutorial.css';

const STORAGE_KEY = 'zd.tutorial.l1';
const CARD_WIDTH = 340;
const PAD = 8;

function markDone(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, 'done');
  } catch {
    // Private mode or blocked storage: the tour simply replays next time.
  }
}

function alreadyDone(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'done';
  } catch {
    return false;
  }
}

type Rect = { top: number; left: number; width: number; height: number };

function measure(selector: string | null): Rect | null {
  if (!selector) return null;
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 };
}

export interface TutorialCoachProps {
  /** Only level 1 carries the onboarding tour. */
  level: number;
  /** A modal (puzzle, chat, scope) is open: hold the tour, keep listening. */
  blocked: boolean;
  /** Current case phase; the tour runs only while playing. */
  phase: string;
}

export function TutorialCoach({ level, blocked, phase }: TutorialCoachProps): ReactNode {
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(() => level !== 1 || alreadyDone());
  const [rect, setRect] = useState<Rect | null>(null);
  const stepRef = useRef(step);
  stepRef.current = step;

  const active = !done && level === 1 && phase === 'playing' && !blocked;
  const current: CoachStep | undefined = LEVEL1_STEPS[step];

  // Engine events carry the tour past the step a real action completes.
  useEffect(() => {
    if (done || level !== 1) return;
    return subscribeToGameEvents(({ event }) => {
      const at = LEVEL1_STEPS[stepRef.current];
      if (at?.advanceOn?.includes(event.type)) {
        setStep((prev) => Math.min(prev + 1, LEVEL1_STEPS.length - 1));
      }
    });
  }, [done, level]);

  // Track the highlighted element across layout shifts while the step is visible.
  useEffect(() => {
    if (!active || !current) return;
    const update = (): void => {
      setRect(measure(current.selector));
    };
    update();
    const id = window.setInterval(update, 150);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [active, current]);

  if (!active || !current) return null;

  const last = step >= LEVEL1_STEPS.length - 1;
  const finish = (): void => {
    markDone();
    setDone(true);
  };
  const next = (): void => {
    if (last) finish();
    else setStep((prev) => prev + 1);
  };

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const card: CSSProperties = rect
    ? cardPosition(rect, vw, vh)
    : { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };

  return (
    <div className="coach" role="dialog" aria-modal="true" aria-label={ru.tutorial.label}>
      {rect ? <Spotlight rect={rect} vw={vw} vh={vh} /> : <div className="coach__backdrop" />}
      {rect && <div className="coach__ring" style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }} />}
      <div className="coach__card" style={card}>
        <p className="coach__step">{ru.tutorial.step(step + 1, LEVEL1_STEPS.length)}</p>
        <h3 className="coach__title">{current.title}</h3>
        <p className="coach__body">{current.body}</p>
        <div className="coach__actions">
          <button type="button" className="coach__skip" onClick={finish}>
            {ru.tutorial.skip}
          </button>
          <button type="button" className="coach__next" onClick={next}>
            {last ? ru.tutorial.done : ru.tutorial.next}
          </button>
        </div>
      </div>
    </div>
  );
}

// Four dim panels around the cutout keep the highlighted element clickable.
function Spotlight({ rect, vw, vh }: { rect: Rect; vw: number; vh: number }): ReactNode {
  const dim = 'coach__dim';
  return (
    <>
      <div className={dim} style={{ top: 0, left: 0, width: vw, height: Math.max(0, rect.top) }} />
      <div className={dim} style={{ top: rect.top + rect.height, left: 0, width: vw, height: Math.max(0, vh - rect.top - rect.height) }} />
      <div className={dim} style={{ top: rect.top, left: 0, width: Math.max(0, rect.left), height: rect.height }} />
      <div className={dim} style={{ top: rect.top, left: rect.left + rect.width, width: Math.max(0, vw - rect.left - rect.width), height: rect.height }} />
    </>
  );
}

function cardPosition(rect: Rect, vw: number, vh: number): CSSProperties {
  const left = Math.min(Math.max(rect.left + rect.width / 2 - CARD_WIDTH / 2, 16), vw - CARD_WIDTH - 16);
  const below = rect.top + rect.height + 12;
  // Flip above the target when the lower half of the screen has no room.
  if (rect.top + rect.height > vh * 0.6) {
    return { left, bottom: Math.max(16, vh - rect.top + 12) };
  }
  return { left, top: below };
}
