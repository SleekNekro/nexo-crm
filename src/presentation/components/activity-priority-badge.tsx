import type { Task } from '../../domain/model';
import { activityPriority } from '../../domain/activity-priority';
export default function ActivityPriorityBadge({ task }: { task: Task }) {
  const priority = activityPriority(task);
  return (
    <span className={'activity-priority priority-' + priority.toLowerCase()}>
      Prioridad {priority.toLowerCase()}
    </span>
  );
}
