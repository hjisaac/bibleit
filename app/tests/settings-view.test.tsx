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

  it('renders documented Interface Language selector and no separate translation dropdown', async () => {
    const { $isMultilingualEnabled } = await import('../src/stores/i18n');
    $isMultilingualEnabled.set(true);

    render(<SettingsView {...defaultProps} />);

    expect(screen.getByText('Interface Language')).toBeDefined();
    expect(
      screen.getByText(
        'Setting your language also switches the Scripture translation (English uses WEB; French uses Louis Segond 1910).',
      ),
    ).toBeDefined();

    expect(screen.getByText('English (World English Bible - WEB)')).toBeDefined();
    expect(screen.getByText('Français (Louis Segond 1910 - LSG)')).toBeDefined();

    // No redundant standalone translation selector
    expect(screen.queryByText('Active Translation')).toBeNull();
  });

  it('renders Package 4 On-Device AI Summarizer with 370 MB badge and triggers onDownloadSlm', () => {
    const onDownloadSlm = vi.fn();
    render(
      <SettingsView
        {...defaultProps}
        slmPackageStatus={PackageStatusEnum.NOT_DOWNLOADED}
        onDownloadSlm={onDownloadSlm}
      />,
    );

    expect(screen.getByText('On-Device AI Summarizer')).toBeDefined();
    expect(screen.getByText('370 MB')).toBeDefined();
    expect(screen.getByText(/inference is currently a bit slower/)).toBeDefined();

    const downloadBtn = screen.getByRole('button', { name: 'Download (370 MB)' });
    expect(downloadBtn).toBeDefined();

    fireEvent.click(downloadBtn);
    expect(onDownloadSlm).toHaveBeenCalledTimes(1);
  });

  it('renders progress and cancel button during SLM download', () => {
    const onCancelDownloadSlm = vi.fn();
    render(
      <SettingsView
        {...defaultProps}
        slmPackageStatus={PackageStatusEnum.DOWNLOADING}
        slmProgress={42}
        onCancelDownloadSlm={onCancelDownloadSlm}
      />,
    );

    expect(screen.getByText('42%')).toBeDefined();
    expect(screen.getByText('Downloading model weights (42%)...')).toBeDefined();

    const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
    expect(cancelBtn).toBeDefined();

    fireEvent.click(cancelBtn);
    expect(onCancelDownloadSlm).toHaveBeenCalledTimes(1);
  });

  it('renders Ready status when SLM package is downloaded', () => {
    render(
      <SettingsView
        {...defaultProps}
        slmPackageStatus={PackageStatusEnum.DOWNLOADED}
      />,
    );

    expect(screen.getByText('Ready for offline AI overviews')).toBeDefined();
  });
});
