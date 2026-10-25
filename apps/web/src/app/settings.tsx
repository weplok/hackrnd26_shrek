// Settings screen: independent music and SFX volume sliders, wired to the audio
// engine and persisted on the device.
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button, Panel } from '@zero-day/ui';
import { audio } from '../shared/audio/audio';
import { ru } from '../shared/ui/strings';

function VolumeSlider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }): ReactNode {
  return (
    <label style={{ display: 'block', margin: '16px 0' }}>
      <span style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>{label}</span>
        <span>{Math.round(value * 100)}%</span>
      </span>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(value * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        style={{ width: '100%' }}
      />
    </label>
  );
}

export function SettingsPage(): ReactNode {
  const [music, setMusic] = useState(audio.music);
  const [sfx, setSfx] = useState(audio.sfx);

  return (
    <Panel className="page-panel" title={ru.appName}>
      <h1>{ru.settings}</h1>
      <h2>{ru.audio.title}</h2>
      <p className="copy">{ru.audio.hint}</p>
      <VolumeSlider
        label={ru.audio.music}
        value={music}
        onChange={(v) => {
          setMusic(v);
          audio.setMusic(v);
        }}
      />
      <VolumeSlider
        label={ru.audio.sfx}
        value={sfx}
        onChange={(v) => {
          setSfx(v);
          audio.setSfx(v);
        }}
      />
      <div className="actions">
        <Button variant="primary" onClick={() => audio.playSuccess()}>
          {ru.audio.test}
        </Button>
      </div>
      <Link className="zd-button zd-button--primary button-link" to="/" style={{ marginTop: 16 }}>
        {ru.backToMenu}
      </Link>
    </Panel>
  );
}
