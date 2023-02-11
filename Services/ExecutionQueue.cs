using System.Collections.Concurrent;

namespace SchedulingAssistant.Services
{
    public sealed class ExecutionQueue
    {
        private readonly BlockingCollection<Func<Task>> _queue = new BlockingCollection<Func<Task>>();

        public ExecutionQueue() => Completion = Task.Run(() => ProcessQueueAsync());

        public Task Completion { get; }

        public void Complete() => _queue.CompleteAdding();

        private async Task ProcessQueueAsync()
        {
            foreach (var value in _queue.GetConsumingEnumerable())
                await value();
        }

        public Task Run(Func<Task> lambda)
        {
            var tcs = new TaskCompletionSource<object>();
            _queue.Add(async () =>
            {
                // Execute the lambda and propagate the results to the Task returned from Run
                try
                {
                    await lambda();
                    tcs.TrySetResult(null);
                }
                catch (OperationCanceledException ex)
                {
                    tcs.TrySetCanceled(ex.CancellationToken);
                }
                catch (Exception ex)
                {
                    tcs.TrySetException(ex);
                }
            });
            return tcs.Task;
        }
    }
}
