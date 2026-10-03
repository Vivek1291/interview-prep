import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { AddBlockMenu, BlockEditor } from './Block';
import { uid } from '../../utils/id';

// The list of editable blocks (drag to reorder, add between, duplicate, delete). Used by pages and terms.
export default function BlocksEditor({ blocks, setBlocks }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const onDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    setBlocks((bl) => arrayMove(bl, bl.findIndex((b) => b.id === active.id), bl.findIndex((b) => b.id === over.id)));
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
        <AddBlockMenu compact onAdd={(b) => setBlocks((bl) => [b, ...bl])} />
        {blocks.map((b, i) => (
          <div key={b.id}>
            <BlockEditor
              block={b}
              index={i}
              total={blocks.length}
              onChange={(nb) => setBlocks((bl) => bl.map((x) => (x.id === b.id ? nb : x)))}
              onMove={(dir) => setBlocks((bl) => arrayMove(bl, i, i + dir))}
              onDuplicate={() => setBlocks((bl) => [...bl.slice(0, i + 1), { ...structuredClone(b), id: uid() }, ...bl.slice(i + 1)])}
              onDelete={() => window.confirm('Delete this block?') && setBlocks((bl) => bl.filter((x) => x.id !== b.id))}
            />
            <AddBlockMenu compact onAdd={(nb) => setBlocks((bl) => [...bl.slice(0, i + 1), nb, ...bl.slice(i + 1)])} />
          </div>
        ))}
      </SortableContext>
    </DndContext>
  );
}
