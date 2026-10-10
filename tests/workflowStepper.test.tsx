import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WorkflowStepper } from '../src/ui/Workflow';

afterEach(cleanup);

describe('WorkflowStepper', () => {
  it('lets the user navigate to completed steps only', async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();

    render(<WorkflowStepper current={4} onNavigate={onNavigate} />);

    expect(screen.getByRole('button', { name: 'Upload' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Set rules' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Review & run' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Results' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Match columns' }));

    expect(onNavigate).toHaveBeenCalledOnce();
    expect(onNavigate).toHaveBeenCalledWith(2);
  });

  it('disables completed-step navigation while work is in progress', () => {
    render(<WorkflowStepper current={3} disabled onNavigate={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Upload' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Select data' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Match columns' })).toBeDisabled();
  });
});
