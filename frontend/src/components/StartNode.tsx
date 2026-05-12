import { Handle, Position } from '@xyflow/react';
import { MoveRight } from 'lucide-react';

export default function StartNode() {
  return (
    <div className="grid h-12 w-12 place-items-center rounded-full border border-cyan-300/25 bg-cyan-300/10 text-cyan-100 shadow-glow">
      <MoveRight className="h-5 w-5" />
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-0 !bg-cyan-300" />
    </div>
  );
}
