type BrandMarkProps = {
  size?: number;
  className?: string;
};

export default function BrandMark({ size = 40, className = '' }: BrandMarkProps) {
  return (
    <img
      src="/echora-icon-192.png"
      alt=""
      width={size}
      height={size}
      className={`rounded-[22%] object-cover shadow-[0_0_12px_rgba(98,245,196,0.28)] ${className}`}
      aria-hidden="true"
    />
  );
}
