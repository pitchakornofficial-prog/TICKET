import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('ScannerAdmissionTerminal uniform UI & responsive layout', () => {
  const rootDir = process.cwd();
  const terminalTsx = readFileSync(
    join(rootDir, 'src/components/scanner-admission-terminal.tsx'),
    'utf8',
  );
  const backOfficeCss = readFileSync(
    join(rootDir, 'src/app/back-office/back-office.css'),
    'utf8',
  );

  it('avoids solid primary button classes inside the scanner terminal', () => {
    expect(terminalTsx).not.toContain('button-primary');
    expect(terminalTsx).toContain('secondary-button terminal-submit-btn');
    expect(terminalTsx).toContain('secondary-button terminal-action-btn');
    expect(terminalTsx).toContain('secondary-button scan-next-modal-btn');
  });

  it('uses unified calm surface styling without bright yellow torch or solid black active fills', () => {
    expect(backOfficeCss).toMatch(/\.camera-icon-toggle-btn\.active,\s*\.camera-icon-toggle-btn\.torch-toggle-btn\.active\s*\{[^}]*background:\s*#f1f5f9;/);
    expect(backOfficeCss).toMatch(/\.mode-btn\.active\.entry,\s*\.mode-btn\.active\.exit\s*\{[^}]*background:\s*#f1f5f9;/);
    expect(backOfficeCss).toMatch(/button\.terminal-submit-btn\s*\{[^}]*background:\s*#ffffff;/);
    expect(backOfficeCss).toMatch(/\.scan-next-modal-btn,\s*\.dismiss-scan-modal-btn\s*\{[^}]*background:\s*#ffffff;/);
  });

  it('uses clean nav buttons without underline, compact stat value-unit pairing, and non-overflowing offline buttons', () => {
    expect(terminalTsx).toContain('className="terminal-nav-btn"');
    expect(terminalTsx).toContain('className="terminal-quick-stat-value-row"');
    expect(terminalTsx).toContain('className="log-time-cell"');
    expect(terminalTsx).toContain('data-testid="offline-usage-guide"');
    expect(terminalTsx).toContain('scanner-reticle');
    expect(terminalTsx).not.toContain('viewfinder-floating-torch-btn');
    expect(backOfficeCss).toContain('@keyframes scannerSweep');
    expect(backOfficeCss).toMatch(/\.terminal-meta-row\s*\{[^}]*display:\s*flex;[^}]*gap:\s*0\.5rem;/);
    expect(backOfficeCss).toMatch(/\.scan-input-group\s*\{[^}]*align-items:\s*stretch;/);
    expect(backOfficeCss).toMatch(/\.terminal-nav-btn[\s\S]*?text-decoration:\s*none;/);
    expect(backOfficeCss).toMatch(/\.terminal-action-btn\s*\{[^}]*height:\s*auto;/);
    expect(backOfficeCss).toMatch(/\.log-time-cell\s*\{[^}]*gap:\s*0\.35rem;/);
    expect(terminalTsx).toContain('result-icon-badge');
    expect(terminalTsx).toContain('dismiss-scan-modal-btn');
    expect(backOfficeCss).toContain(':not(.terminal-submit-btn):not(.terminal-action-btn):not(.scan-next-modal-btn):not(.dismiss-scan-modal-btn)');
  });

  it('aligns wrapper and container widths and includes tablet/mobile responsive breakpoints', () => {
    expect(backOfficeCss).toMatch(/\.terminal-wrapper\s*\{[^}]*max-width:\s*720px;/);
    expect(backOfficeCss).toMatch(/\.terminal-container\s*\{[^}]*max-width:\s*100%;/);
    expect(backOfficeCss).toContain('@media (max-width: 1024px)');
    expect(backOfficeCss).toContain('@media (max-width: 640px)');
    expect(backOfficeCss).toContain('@media (max-width: 480px)');
  });
});
