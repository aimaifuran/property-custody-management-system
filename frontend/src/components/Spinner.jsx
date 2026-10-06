import Skeleton from './Skeleton';

export default function Spinner({ size = 16, className = '' }) {
  return <Skeleton className={className} style={{ width: size, height: size }} />;
}
