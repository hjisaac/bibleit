import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import { SettingsView } from '../src/components/SettingsView';
import { PackageStatusEnum, ThemeEnum, SearchModeEnum } from '../src/core/types';

describe('SettingsView Component', () => {
  const defaultProps = {
    currentTheme: ThemeEnum.SEPIA,
    onThemeChange: vi.fn(),
    isAiEnabled: true,
    onToggleAi: vi.fn(),
    isInspectorMode: false,
    onToggleInspector: vi.fn(),
    showHeadings: true,
    onToggleHeadings: vi.fn(),
    textPackageStatus: PackageStatusEnum.DOWNLOADED,
    aiPackageStatus: PackageStatusEnum.NOT_DOWNLOADED,
    modelPackageStatus: PackageStatusEnum.NOT_DOWNLOADED,
    textProgress: 100,
    aiProgress: 0,
    modelProgress: 0,
    searchMode: SearchModeEnum.AUTO,
    onToggleSearchMode: vi.fn(),
    onDownloadText: vi.fn(),
    onDownloadAi: vi.fn(),
    onDownloadModel: vi.fn(),
    onClearStorage: vi.fn(),
  };

  it('renders AI Scripture Overview title, badge, and description', () => {
    render(<SettingsView {...defaultProps} />);

    expect(screen.getByText('AI Scripture Overview')).toBeDefined();
    expect(
      screen.getByText('Generate grounded scripture summaries when searching topics and questions.'),
    ).toBeDefined();
  });

  it('reflects checked state and calls onToggleAi(false) when toggled off', () => {
    const onToggleAi = vi.fn();
    render(<SettingsView {...defaultProps} isAiEnabled={true} onToggleAi={onToggleAi} />);

    const checkbox = screen.getByRole('checkbox', { name: 'AI Scripture Overview' }) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);

    fireEvent.change(checkbox, { target: { checked: false } });
    expect(onToggleAi).toHaveBeenCalledWith(false);
  });

  it('reflects unchecked state and calls onToggleAi(true) when toggled on', () => {
    const onToggleAi = vi.fn();
    render(<SettingsView {...defaultProps} isAiEnabled={false} onToggleAi={onToggleAi} />);

    const checkbox = screen.getByRole('checkbox', { name: 'AI Scripture Overview' }) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);

    fireEvent.change(checkbox, { target: { checked: true } });
    expect(onToggleAi).toHaveBeenCalledWith(true);
  });
});
