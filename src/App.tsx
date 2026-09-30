import { useState } from 'react';
import { JoinScreen } from './components/JoinScreen';
import { Workspace } from './components/Workspace';
import { clearCode, loadCode, saveCode } from './storage';

export function App() {
  const [code, setCode] = useState(loadCode);
  const [notice, setNotice] = useState('');

  if (!code) {
    return (
      <JoinScreen
        notice={notice}
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
      onUnauthorised={() => {
        clearCode();
        setNotice("Your workshop code isn't working any more. Please ask your facilitator for the current one.");
        setCode('');
      }}
    />
  );
}
