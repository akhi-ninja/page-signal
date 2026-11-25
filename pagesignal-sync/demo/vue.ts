import { createApp, defineComponent, h, onMounted, onUnmounted, ref } from 'vue';
import { inventory, empty, act, add, sync, keepLocal, describe } from './inventory.ts';

createApp(defineComponent({
  setup() {
    const data = ref(empty);
    const status = ref('');
    const run = (operation: () => Promise<unknown>) => void act(operation, (message) => status.value = message);
    let subscription: ReturnType<ReturnType<typeof inventory.watch>['subscribe']>;
    onMounted(() => {
      subscription = inventory.watch().subscribe({
        next: (result) => data.value = result,
        error: (error) => status.value = String(error),
      });
    });
    onUnmounted(() => subscription?.unsubscribe());
    return () => h('main', [
      h('h1', 'Inventory · Vue'),
      h('button', { onClick: () => run(add) }, 'Set Widget to 1'),
      h('button', { onClick: () => run(sync) }, 'Sync now'),
      h('ul', data.value.records.map(({ id, value }) => h('li', { key: id }, [
        `${id}: ${value.quantity} `,
        h('button', { onClick: () => run(() => inventory.put(id, { quantity: value.quantity + 1 })) }, '+1'),
        h('button', { onClick: () => run(() => inventory.remove(id)) }, 'Delete'),
      ]))),
      ...data.value.conflicts.map((conflict) => h('section', { key: conflict.id }, [
        h('p', describe(conflict)),
        h('button', { onClick: () => run(() => keepLocal(conflict)) }, 'Keep local'),
        h('button', { onClick: () => run(() => inventory.resolve(conflict.id)) }, 'Keep server'),
      ])),
      h('p', { role: 'status' }, status.value),
    ]);
  },
})).mount('#app');
