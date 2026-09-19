import { LockKeyhole, Monitor, Moon, Settings2, Sun } from 'lucide-react';
import { type ChangeEvent, useRef, useState } from 'react';

import type { SavedProfile } from '../domain/types';

export type ThemeChoice = 'system' | 'light' | 'dark';

interface AppHeaderProps {
  canSaveProfile: boolean;
  onDeleteProfile: (profile: SavedProfile) => void;
  onDuplicateProfile: (profile: SavedProfile) => void;
  onExportProfile: (profile: SavedProfile) => void;
  onImportProfile: (text: string) => void;
  onSaveProfile: (name: string, profile?: SavedProfile) => void;
  onSelectProfile: (id: string) => void;
  onThemeChange: (theme: ThemeChoice) => void;
  profiles: SavedProfile[];
  selectedProfileId: string;
  theme: ThemeChoice;
}

const THEME_ORDER: ThemeChoice[] = ['system', 'light', 'dark'];

export function AppHeader({
  canSaveProfile,
  onDeleteProfile,
  onDuplicateProfile,
  onExportProfile,
  onImportProfile,
  onSaveProfile,
  onSelectProfile,
  onThemeChange,
  profiles,
  selectedProfileId,
  theme,
}: AppHeaderProps) {
  const [isManaging, setIsManaging] = useState(false);
  const selected = profiles.find((profile) => profile.id === selectedProfileId);
  const [name, setName] = useState(selected?.name ?? '');
  const importInput = useRef<HTMLInputElement>(null);

  const cycleTheme = () => {
    const currentIndex = THEME_ORDER.indexOf(theme);
    onThemeChange(THEME_ORDER[(currentIndex + 1) % THEME_ORDER.length] ?? 'system');
  };

  const readImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.item(0);
    if (!file) return;
    onImportProfile(await file.text());
    event.currentTarget.value = '';
  };

  const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;

  return (
    <header className="app-header">
      <div className="header-inner">
        <button className="wordmark" onClick={() => location.reload()} type="button">
          Reconciler
        </button>
        <p className="privacy-message">
          <LockKeyhole aria-hidden="true" size={22} strokeWidth={2.2} />
          <span>Your files stay on this device</span>
        </p>
        <div className="header-tools">
          <label className="profile-control">
            <span>Profile</span>
            <select
              onChange={(event) => {
                onSelectProfile(event.currentTarget.value);
                const profile = profiles.find((candidate) => candidate.id === event.currentTarget.value);
                setName(profile?.name ?? '');
              }}
              value={selectedProfileId}
            >
              <option value="">New reconciliation</option>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
          </label>
          <button
            aria-label={`Theme: ${theme}. Change theme`}
            className="icon-button"
            onClick={cycleTheme}
            title={`Theme: ${theme}`}
            type="button"
          >
            <ThemeIcon aria-hidden="true" size={20} />
          </button>
          <div className="profile-menu-wrap">
            <button
              aria-expanded={isManaging}
              aria-label="Manage profiles"
              className="icon-button"
              onClick={() => setIsManaging((value) => !value)}
              type="button"
            >
              <Settings2 aria-hidden="true" size={20} />
            </button>
            {isManaging ? (
              <div className="profile-menu">
                <h2>Profile settings</h2>
                <label>
                  <span>Profile name</span>
                  <input
                    maxLength={80}
                    onChange={(event) => setName(event.currentTarget.value)}
                    placeholder="Monthly reconciliation"
                    value={name}
                  />
                </label>
                <button
                  className="menu-primary"
                  disabled={!canSaveProfile || !name.trim()}
                  onClick={() => onSaveProfile(name, selected)}
                  type="button"
                >
                  {selected ? 'Save changes' : 'Save profile'}
                </button>
                <div className="menu-grid">
                  <button
                    disabled={!selected}
                    onClick={() => selected && onDuplicateProfile(selected)}
                    type="button"
                  >
                    Duplicate
                  </button>
                  <button
                    disabled={!selected}
                    onClick={() => selected && onExportProfile(selected)}
                    type="button"
                  >
                    Export JSON
                  </button>
                  <button onClick={() => importInput.current?.click()} type="button">
                    Import JSON
                  </button>
                  <button
                    className="danger-text"
                    disabled={!selected}
                    onClick={() => selected && onDeleteProfile(selected)}
                    type="button"
                  >
                    Delete
                  </button>
                </div>
                <input
                  accept="application/json,.json"
                  className="visually-hidden"
                  onChange={(event) => void readImport(event)}
                  ref={importInput}
                  type="file"
                />
                <p>Profiles store rules and column names only—never source data or results.</p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
