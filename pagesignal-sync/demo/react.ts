import { createElement as h, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { inventory, empty, act, add, sync, keepLocal, describe } from './inventory.ts';

function Inventory() {
  const [data, setData] = useState(empty);
  const [status, setStatus] = useState('');
  const run = (operation: () => Promise<unknown>) => void act(operation, setStatus);
  useEffect(() => {
    const subscription = inventory.watch().subscribe({ next: setData, error: (error) => setStatus(String(error)) });
    return () => subscription.unsubscribe();
  }, []);
  return h('main', null,
    h('h1', null, 'Inventory · React'),
    h('button', { onClick: () => run(add) }, 'Set Widget to 1'),
    h('button', { onClick: () => run(sync) }, 'Sync now'),
    h('ul', null, data.records.map(({ id, value }) => h('li', { key: id },
      `${id}: ${value.quantity} `,
      h('button', { onClick: () => run(() => inventory.put(id, { quantity: value.quantity + 1 })) }, '+1'),
      h('button', { onClick: () => run(() => inventory.remove(id)) }, 'Delete')))),
    ...data.conflicts.map((conflict) => h('section', { key: conflict.id },
      h('p', null, describe(conflict)),
      h('button', { onClick: () => run(() => keepLocal(conflict)) }, 'Keep local'),
      h('button', { onClick: () => run(() => inventory.resolve(conflict.id)) }, 'Keep server'))),
    h('p', { role: 'status' }, status));
}

createRoot(document.querySelector('#app')!).render(h(Inventory));
