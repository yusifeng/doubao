import { render, screen } from '@testing-library/react-native';
import { HelloWorld } from '../HelloWorld';

describe('HelloWorld', () => {
  it('renders greeting text with name', () => {
    render(<HelloWorld name="David" />);

    expect(screen.getByText('Hello, David!')).toBeTruthy();
  });

  it('renders ready hint text', () => {
    render(<HelloWorld name="React Native" />);

    expect(screen.getByText('RN + NativeWind + Jest 已就绪')).toBeTruthy();
  });
});
