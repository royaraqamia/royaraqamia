import { RadioGroup, RadioGroupItem } from '@radix-ui/react-radio-group';

export function GenderSelector() {
  return (
    <RadioGroup defaultValue="male">
      <label>
        <RadioGroupItem value="male" /> ذكر
      </label>
      <label>
        <RadioGroupItem value="female" /> أنثى
      </label>
    </RadioGroup>
  );
}
