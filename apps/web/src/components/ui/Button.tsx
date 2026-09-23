import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const styles = cva('inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-xs font-semibold tracking-[.14em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cyan)] disabled:opacity-40', {
  variants: {
    variant: {
      primary: 'bg-white text-black hover:bg-[var(--cyan)]',
      outline: 'border border-[var(--border)] bg-white/[.02] text-white hover:border-white/40 hover:bg-white/[.06]',
      danger: 'bg-[var(--red)] text-white hover:bg-[#e52e47]',
    },
  },
  defaultVariants: { variant: 'primary' },
});

export function Button({ asChild, className, variant, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof styles> & { asChild?: boolean }) {
  const Component = asChild ? Slot : 'button';
  return <Component className={cn(styles({ variant }), className)} {...props} />;
}
