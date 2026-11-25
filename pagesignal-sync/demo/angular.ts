import '@angular/compiler';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { inventory, empty, act, add, sync, keepLocal, describe } from './inventory.ts';

class Inventory {
  data = signal(empty);
  status = signal('');
  add = add;
  sync = sync;
  describe = describe;

  constructor() {
    const subscription = inventory.watch().subscribe({
      next: (data) => this.data.set(data),
      error: (error) => this.status.set(String(error)),
    });
    inject(DestroyRef).onDestroy(() => subscription.unsubscribe());
  }

  increment(id: string, quantity: number) {
    this.run(() => inventory.put(id, { quantity: quantity + 1 }));
  }

  remove(id: string) {
    this.run(() => inventory.remove(id));
  }

  retry(conflict: Parameters<typeof keepLocal>[0]) {
    this.run(() => keepLocal(conflict));
  }

  keepServer(id: string) {
    this.run(() => inventory.resolve(id));
  }

  run(operation: () => Promise<unknown>) {
    void act(operation, this.status.set);
  }
}

Component({
  selector: 'inventory-app',
  template: `
    <main>
      <h1>Inventory · Angular</h1>
      <button (click)="run(add)">Set Widget to 1</button>
      <button (click)="run(sync)">Sync now</button>
      <ul>
        @for (item of data().records; track item.id) {
          <li>
            {{ item.id }}: {{ item.value.quantity }}
            <button (click)="increment(item.id, item.value.quantity)">+1</button>
            <button (click)="remove(item.id)">Delete</button>
          </li>
        }
      </ul>
      @for (conflict of data().conflicts; track conflict.id) {
        <section>
          <p>{{ describe(conflict) }}</p>
          <button (click)="retry(conflict)">Keep local</button>
          <button (click)="keepServer(conflict.id)">Keep server</button>
        </section>
      }
      <p role="status">{{ status() }}</p>
    </main>
  `,
})(Inventory);

void bootstrapApplication(Inventory);
