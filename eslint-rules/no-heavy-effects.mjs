/**
 * Bans the per-frame UI effects removed by ADR 0004 so the flattening cannot
 * leak back in. These utilities are cheap to reintroduce by copy-paste and
 * expensive to notice in review, which is exactly what a lint rule is for.
 *
 * Banned: `transition-all` (animates layout), `backdrop-blur-*` (backdrop
 * filters), the `glow-blur-*` live filters, `logo-glow`, `scroll-arrow-blur`.
 * Static depth cues — shadows, gradients — are deliberately allowed.
 */

const RULES = [
  {
    test: (s) => /(?<![\w-])transition-all(?![\w-])/.test(s),
    message:
      '`transition-all` animates every property, including layout. Use `transition-safe` (compositor-only) instead. See ADR 0004.',
  },
  {
    test: (s) => /backdrop-blur/.test(s),
    message: 'Backdrop filters are removed site-wide. Use an opaque fill instead. See ADR 0004.',
  },
  {
    test: (s) => /(?<![\w-])glow-blur/.test(s),
    message:
      'Live glow blurs are removed. Use `glow-orb` (a one-time radial gradient) instead. See ADR 0004.',
  },
  {
    test: (s) => /(?<![\w-])logo-glow/.test(s),
    message: 'The logo drop-shadow glow is removed. See ADR 0004.',
  },
  {
    test: (s) => /(?<![\w-])scroll-arrow-blur/.test(s),
    message: 'The scroll-arrow backdrop blur is removed. See ADR 0004.',
  },
];

function checkString(context, node, value) {
  if (typeof value !== 'string') return;
  for (const rule of RULES) {
    if (rule.test(value)) {
      context.report({ node, message: rule.message });
    }
  }
}

const plugin = {
  rules: {
    'no-heavy-effects': {
      meta: {
        type: 'problem',
        docs: { description: 'Ban per-frame UI effects removed by ADR 0004' },
        schema: [],
        messages: {},
      },
      create(context) {
        return {
          Literal(node) {
            checkString(context, node, node.value);
          },
          TemplateElement(node) {
            checkString(context, node, node.value?.raw);
          },
        };
      },
    },
  },
};

export default plugin;
