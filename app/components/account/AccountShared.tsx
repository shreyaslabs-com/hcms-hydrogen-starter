/**
 * Shared pieces of the customer account pages (T-2.22): states before a customer is loaded,
 * logout, address text and form inputs. App code (Customer Account API); sections only pass
 * merchant settings.
 */
import type { ReactNode } from 'react';

export const buttonClass =
  'rounded-button focus-visible:outline-accent inline-flex min-h-11 cursor-pointer items-center justify-center px-5 text-sm font-medium no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-[color,background-color,border-color,transform] motion-safe:active:scale-[0.97]';

export const inputClass =
  'border-border bg-surface text-on-surface min-h-11 w-full rounded border px-3 text-base aria-[invalid=true]:border-critical';

export const dateFormat = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeZone: 'UTC',
});

/** Loader states every account page shares before the customer's data. */
export type AccountGate =
  | { status: 'unavailable' }
  | { status: 'signed-out'; loginFailed: boolean }
  | { status: 'error'; message: string };

/** Renders the shared states; `null` when the page's own body should render. */
export function AccountGateView({
  data,
  returnTo,
}: {
  data: AccountGate | { status: string };
  returnTo: string;
}) {
  if (data.status === 'unavailable') return <Unavailable />;
  if (data.status === 'signed-out')
    return (
      <SignIn
        loginFailed={(data as { loginFailed?: boolean }).loginFailed ?? false}
        returnTo={returnTo}
      />
    );
  if (data.status === 'error')
    return (
      <>
        <p role="alert" className="border-border bg-surface-secondary rounded border p-4">
          {(data as { message: string }).message}
        </p>
        <LogoutForm />
      </>
    );
  return null;
}

function Unavailable() {
  return (
    <section className="border-border rounded border p-8" aria-labelledby="unavailable-heading">
      <h2 id="unavailable-heading" className="type-heading-md text-on-surface mb-3">
        Accounts are unavailable right now
      </h2>
      <p className="text-on-surface-secondary max-w-xl">
        Signing in isn&apos;t available at the moment. Please try again later, or contact us if you
        need help with an order.
      </p>
    </section>
  );
}

function SignIn({ loginFailed, returnTo }: { loginFailed: boolean; returnTo: string }) {
  return (
    <section className="border-border rounded border p-8" aria-labelledby="sign-in-heading">
      <h2 id="sign-in-heading" className="type-heading-md text-on-surface mb-3">
        Sign in
      </h2>
      <p className="text-on-surface-secondary mb-6 max-w-xl">
        Sign in to see your orders and addresses.
      </p>
      {loginFailed ? (
        <p role="alert" className="border-border bg-surface-secondary mb-6 rounded border p-4">
          We couldn&apos;t sign you in. Try again.
        </p>
      ) : null}
      {/* A plain <a>: the OAuth redirect needs a full page navigation. */}
      <a
        href={`/account/login?return_to=${encodeURIComponent(returnTo)}`}
        className={`button-primary ${buttonClass}`}
      >
        Sign in
      </a>
    </section>
  );
}

export function LogoutForm() {
  // A plain <form>: the logout redirect needs a full page navigation.
  return (
    <form method="post" action="/account/logout" className="mt-6">
      <button type="submit" className={`button-outline ${buttonClass}`}>
        Log out
      </button>
    </form>
  );
}

/** Customer Account API `formatted` address lines. */
export function AddressLines({ lines }: { lines: readonly string[] }) {
  return (
    <address className="text-on-surface-secondary not-italic">
      {lines.map((line, i) => (
        <span key={i} className="block">
          {line}
        </span>
      ))}
    </address>
  );
}

/** Labelled input with its error wired to `aria-describedby` (WCAG 3.3.1). */
export function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string | undefined;
  children: (props: {
    id: string;
    'aria-invalid'?: true;
    'aria-describedby'?: string;
  }) => ReactNode;
}) {
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-on-surface text-sm font-medium">
        {label}
      </label>
      {children({
        id,
        ...(error ? { 'aria-invalid': true as const, 'aria-describedby': errorId } : {}),
      })}
      {error ? (
        <p id={errorId} className="text-critical text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
