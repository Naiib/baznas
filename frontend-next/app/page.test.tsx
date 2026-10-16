import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import PublicPortalPage from './page';
import Link from 'next/link';

vi.mock('next/link', () => ({
  default: vi.fn(({ href, children, ...props }) => (
    <a data-testid="next-link" href={href} {...props}>
      {children}
    </a>
  )),
}));

describe('PublicPortalPage', () => {
  it('links visitors to the functional application and tracking routes via Next Link', () => {
    render(<PublicPortalPage />);

    const intakeLink = screen.getByRole('link', { name: /ajukan bantuan/i });
    expect(intakeLink).toHaveAttribute('href', '/pengajuan');
    expect(intakeLink).toHaveAttribute('data-testid', 'next-link');

    const trackingLink = screen.getByRole('link', { name: /cek status pengajuan/i });
    expect(trackingLink).toHaveAttribute('href', '/cek-pengajuan');
    expect(trackingLink).toHaveAttribute('data-testid', 'next-link');

    const calledHrefs = vi.mocked(Link).mock.calls.map((call) => call[0].href);
    expect(calledHrefs).toContain('/pengajuan');
    expect(calledHrefs).toContain('/cek-pengajuan');
  });

  it('renders cross-host login CTA using native <a> instead of Next <Link> to avoid RSC CORS errors', () => {
    render(<PublicPortalPage />);

    const loginLink = screen.getByRole('link', { name: /portal amil sim/i });
    expect(loginLink).toHaveAttribute('href', '/login');
    expect(loginLink.tagName.toLowerCase()).toBe('a');
    expect(loginLink).not.toHaveAttribute('data-testid');

    const calledHrefs = vi.mocked(Link).mock.calls.map((call) => call[0].href);
    expect(calledHrefs).not.toContain('/login');
  });
});
