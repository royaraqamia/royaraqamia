import { Switch } from '@radix-ui/react-switch';

export function ThemeSwitch() {
  return (
    <div>
      <label htmlFor="theme-switch">الوضع الليلي</label>
      <Switch id="theme-switch" />
    </div>
  );
}
