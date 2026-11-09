/**
 * Example custom section (docs/developers/custom-sections.md, "Quick start"). Not registered:
 * copy it to `app/sections/custom/promo-banner.tsx` to add it to your storefront.
 */
import {
  colorSchemeClass,
  defineSection,
  useAppComponents,
  type SectionComponentProps,
} from '@hcms/hydrogen';

/** Settings can briefly hold non-string values in the editor, so read them defensively. */
const text = (value: unknown): string => (typeof value === 'string' ? value : '');

function PromoBanner({ settings }: SectionComponentProps) {
  const { Link } = useAppComponents();
  const heading = text(settings.heading);
  const body = text(settings.text);
  const label = text(settings.button_label);
  const link = text(settings.button_link);
  const scheme = text(settings.color_scheme);
  const align =
    settings.alignment === 'start' ? 'items-start text-start' : 'items-center text-center';

  return (
    <div
      className={scheme ? colorSchemeClass(scheme) : undefined}
      style={{
        backgroundColor: 'var(--color-background, var(--color-surface))',
        color: 'var(--color-text, var(--color-on-surface))',
      }}
    >
      <div className={`max-w-page px-margin mx-auto flex flex-col gap-4 py-12 ${align}`}>
        {heading ? <h2 className="type-heading-lg">{heading}</h2> : null}
        {body ? <p className="type-body max-w-2xl">{body}</p> : null}
        {label && link ? (
          <Link
            to={link}
            className="button-primary hcms-button hcms-button--primary rounded-button inline-flex min-h-11 items-center px-6 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
          >
            {label}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export const promoBanner = defineSection({
  type: 'promo-banner',
  name: 'Promo banner',
  settings: [
    { type: 'text', id: 'heading', label: 'Heading', default: 'Free shipping this week' },
    { type: 'textarea', id: 'text', label: 'Text', default: 'On every order, no code needed.' },
    { type: 'header', content: 'Button' },
    { type: 'text', id: 'button_label', label: 'Label', default: 'Shop now' },
    { type: 'url', id: 'button_link', label: 'Link', default: '/collections/all' },
    {
      type: 'select',
      id: 'alignment',
      label: 'Alignment',
      options: [
        { value: 'start', label: 'Start' },
        { value: 'center', label: 'Center' },
      ],
      default: 'center',
    },
    { type: 'color_scheme', id: 'color_scheme', label: 'Color scheme', default: 'scheme-1' },
  ],
  presets: [{ name: 'Promo banner', category: 'Banners' }],
  component: PromoBanner,
});
