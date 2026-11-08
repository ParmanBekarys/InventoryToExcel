import { FileSpreadsheet } from 'lucide-react';
import { useEffect } from 'react';
import { ExportButton } from './components/SessionWidgets';
import { Button, Card, PageHeader } from './components/ui';
import { useHashRoute, type Navigate } from './hooks/useHashRoute';
import { AppLayout } from './layouts/AppLayout';
import { DashboardPage } from './pages/DashboardPage';
import { InventoryPage } from './pages/InventoryPage';
import { ItemEditorPage } from './pages/ItemEditorPage';
import { CategoriesPage, LocationsPage } from './pages/ListPages';
import { SessionPage } from './pages/SessionPage';
import { UploadPage } from './pages/UploadPage';
import { useSession } from './state/SessionContext';

function SwitchFile({ navigate }: { navigate: Navigate }) {
  const { changes, reset } = useSession();
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Upload Excel" subtitle="Open a different inventory file." />
      <Card className="p-5">
        <div className="flex gap-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <FileSpreadsheet className="size-5" />
          </div>
          <div className="text-sm leading-relaxed text-muted">
            Opening another file closes the current inventory.
            {changes.unsaved ? (
              <strong className="mt-2 block text-amber-700">You have changes that were not downloaded. Download them first or they will be lost.</strong>
            ) : (
              ' All your changes are already in a downloaded file.'
            )}
          </div>
        </div>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          {changes.unsaved && <ExportButton />}
          <Button
            variant={changes.unsaved ? 'secondary' : 'primary'}
            onClick={() => {
              reset();
              navigate('/');
            }}
          >
            {changes.unsaved ? 'Discard and open another file' : 'Open another file'}
          </Button>
        </div>
      </Card>
    </div>
  );
}

export default function App() {
  const { state } = useSession();
  const { path, navigate } = useHashRoute();
  const [route, query] = path.split('?');
  const params = new URLSearchParams(query ?? '');

  useEffect(() => {
    if (state.loaded && (route === '/' || route === '')) navigate('/dashboard');
  }, [state.loaded, route, navigate]);

  if (!state.loaded) return <UploadPage onLoaded={() => navigate('/dashboard')} />;

  let page;
  if (route.startsWith('/edit/')) {
    const editUid = decodeURIComponent(route.slice(6));
    page = <ItemEditorPage key={editUid} editUid={editUid} navigate={navigate} />;
  } else {
    switch (route) {
      case '/inventory':
        page = <InventoryPage key={path} navigate={navigate} initialCategory={params.get('category') ?? ''} initialLocation={params.get('location') ?? ''} />;
        break;
      case '/add':
        page = <ItemEditorPage key="add" navigate={navigate} />;
        break;
      case '/categories':
        page = <CategoriesPage navigate={navigate} />;
        break;
      case '/locations':
        page = <LocationsPage navigate={navigate} />;
        break;
      case '/session':
        page = <SessionPage onReset={() => navigate('/')} />;
        break;
      case '/upload':
        page = <SwitchFile navigate={navigate} />;
        break;
      default:
        page = <DashboardPage navigate={navigate} />;
    }
  }
  return (
    <AppLayout path={path} navigate={navigate}>
      {page}
    </AppLayout>
  );
}
