export default class PromiseQueue {
    private queue: Promise<unknown> = Promise.resolve();

    add(operation: () => Thenable<unknown>) {
        return new Promise((resolve, reject) => {
            this.queue = this.queue.then(operation).then(resolve).catch(reject);
        });
    }
}
