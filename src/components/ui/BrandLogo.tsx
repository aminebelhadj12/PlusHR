interface BrandLogoProps {
  variant?: 'full' | 'icon' | 'icon-with-name';
}

const wordmark = new URL('../../assets/brand/icon.png', import.meta.url).href;
const symbol = new URL('../../assets/brand/logo.png', import.meta.url).href;

export function BrandLogo({ variant = 'full' }: BrandLogoProps) {
  if (variant === 'full') {
    return (
      <img
        src={wordmark}
        alt="+HR"
        width={2172}
        height={724}
        className="block h-auto w-36 max-w-full select-none sm:w-40 dark:rounded-lg dark:bg-slate-100"
      />
    );
  }

  return (
    <span className="inline-flex shrink-0 select-none items-center gap-2 whitespace-nowrap">
      <img
        src={symbol}
        alt={variant === 'icon' ? '+HR' : ''}
        width={1312}
        height={1199}
        className="size-8 shrink-0 object-contain"
      />
      {variant === 'icon-with-name' && (
        <span className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-white">+HR</span>
      )}
    </span>
  );
}
