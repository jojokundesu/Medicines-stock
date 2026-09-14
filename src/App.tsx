import { useEffect } from 'react';
import { useGame } from './store/gameStore';
import type { MedicineData } from './engine/products';
import Menu from './components/Menu';
import Shift from './components/Shift';
import Report from './components/Report';
import Drills from './components/Drills';

export default function App() {
  const screen = useGame(s => s.screen);
  const loadMedicines = useGame(s => s.loadMedicines);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/medicines.json`)
      .then(r => r.json())
      .then((d: MedicineData) => loadMedicines(d))
      .catch(err => console.error('failed to load medicines', err));
  }, [loadMedicines]);

  if (screen === 'menu') return <Menu />;
  if (screen === 'shift') return <Shift />;
  if (screen === 'drills') return <Drills />;
  return <Report />;
}
