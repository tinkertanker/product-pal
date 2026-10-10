import { useState } from 'react';
import { AdminPage } from './components/AdminPage';
import { JoinScreen } from './components/JoinScreen';
import { Workspace } from './components/Workspace';
import { useSettings } from './components/useSettings';
import { clearCode, clearDevice, hasLocalDraft, loadCode, saveCode } from './storage';

const isAdminPath = () => /^\/admin\/?$/.test(window.location.pathname);

export function App() {
  return isAdminPath() ? <AdminPage /> : <Participant />;
}

function Participant() {
  const [code, setCode] = useState(loadCode);
  const [notice, setNotice] = useState('');
  const [draft, setDraft] = useState(hasLocalDraft);
  const settings = useSettings();

  const wipeDevice = () => {
    clearDevice();
    setDraft(false);
    setNotice('');
    setCode('');
  };

  if (!code) {
    return (
      <JoinScreen
        notice={notice}
        showTimings={settings.showTimings}
        hasDraft={draft}
        onClearDevice={wipeDevice}
        onJoined={(joined) => {
          saveCode(joined);
          setNotice('');
          setCode(joined);
        }}
      />
    );
  }

  return (
    <Workspace
      code={code}
      settings={settings}
      onUnauthorised={() => {
        clearCode();
        setNotice("Your workshop code isn't working any more. Please ask your facilitator for the current one.");
        setCode('');
      }}
      onClearDevice={wipeDevice}
    />
  );
}
