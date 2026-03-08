import React from 'react';
import { Reorder } from 'motion/react';

type Axis = 'x' | 'y';

interface ReorderListProps<T> {
  items: T[];
  onReorder: (items: T[]) => void;
  axis?: Axis;
  className?: string;
  itemClassName?: string;
  layoutScroll?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  as?: keyof JSX.IntrinsicElements | React.ComponentType<any>;
  getKey?: (item: T, index: number) => string | number;
  children: (item: T, index: number) => React.ReactNode;
}

export function ReorderList<T>({
  items,
  onReorder,
  axis = 'y',
  className,
  itemClassName,
  layoutScroll = true,
  as = 'div',
  getKey,
  children,
}: ReorderListProps<T>) {
  return (
    <Reorder.Group
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      as={as as any}
      axis={axis}
      values={items}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onReorder={onReorder as any}
      layoutScroll={layoutScroll}
      className={className}
    >
      {items.map((item, index) => (
        <Reorder.Item
          as="div"
          key={(getKey ? getKey(item, index) : index) as React.Key}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          value={item as any}
          className={itemClassName}
        >
          {children(item, index)}
        </Reorder.Item>
      ))}
    </Reorder.Group>
  );
}

export default ReorderList;
