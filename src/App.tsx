import { useConnectionStore } from './stores/connection';
import ConnectionScreen from './screens/Connection';
import Workspace from './screens/Workspace';
import { ToastHost } from './components/Toast';

export default function App() {
  const connection = useConnectionStore((s) => s.connection);
  return (
    <div className="h-screen overflow-hidden">
      {connection ? <Workspace /> : <ConnectionScreen />}
      <ToastHost />
    </div>
  );
}
