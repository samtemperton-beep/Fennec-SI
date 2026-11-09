import { redirect } from 'next/navigation'

// Goals now live under Savings (one tab instead of two); old links still work.
export default function GoalsMoved() {
  redirect('/app/finance/savings/goals')
}
