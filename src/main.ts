import { renderBikePage, type BikePage } from './bikePage';
import { renderSearch } from './search';
import './styles.css';

// Routes:
//   #/                                   search
//   #/bike/<bikeId>                      exploded view
//   #/bike/<bikeId>/<assemblyId>/<index> exploded view with a part selected
const root = document.getElementById('app')!;
let current: BikePage | null = null;
let routeSeq = 0;

async function route() {
  const seq = ++routeSeq;
  const [, kind, bikeId, assemblyId, index] = location.hash.replace(/^#\/?/, '/').split('/').map(decodeURIComponent);
  const partKey = assemblyId && index !== undefined ? `${assemblyId}:${index}` : null;

  if (kind === 'bike' && bikeId) {
    if (current?.bikeId !== bikeId) {
      current?.dispose();
      current = null;
      const page = await renderBikePage(root, bikeId);
      if (seq !== routeSeq) {
        page?.dispose(); // a newer navigation happened while loading
        return;
      }
      current = page;
    }
    current?.selectFromRoute(partKey);
    return;
  }

  current?.dispose();
  current = null;
  await renderSearch(root);
}

window.addEventListener('hashchange', route);
route();
