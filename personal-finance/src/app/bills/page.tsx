import { prisma } from "@/lib/db";
import { formatCurrency } from "@/lib/categories";
import AddBillForm from "./AddBillForm";
import BillCard from "./BillCard";
import ResetBillsButton from "./ResetBillsButton";

export const dynamic = "force-dynamic";

export default async function BillsPage() {
  const bills = await prisma.bill.findMany({
    orderBy: { dueDay: "asc" },
  });

  const now = new Date();
  const currentDay = now.getDate();

  // Categorize bills by status
  const billsWithStatus = bills.map((bill) => {
    let status: "paid" | "due_soon" | "overdue" | "upcoming" = "upcoming";

    if (bill.isPaid) {
      status = "paid";
    } else if (currentDay > bill.dueDay) {
      status = "overdue";
    } else if (bill.dueDay - currentDay <= 3) {
      status = "due_soon";
    }

    return { ...bill, status };
  });

  const overdueBills = billsWithStatus.filter((b) => b.status === "overdue");
  const dueSoonBills = billsWithStatus.filter((b) => b.status === "due_soon");
  const upcomingBills = billsWithStatus.filter((b) => b.status === "upcoming");
  const paidBills = billsWithStatus.filter((b) => b.status === "paid");

  const totalMonthly = bills.reduce((sum, b) => sum + b.amount, 0);
  const totalPaid = paidBills.reduce((sum, b) => sum + b.amount, 0);
  const totalRemaining = totalMonthly - totalPaid;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Bill Reminders</h2>
          <p className="text-muted text-sm mt-1">
            Track your recurring bills and due dates
          </p>
        </div>
        <ResetBillsButton />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-card border border-card-border rounded-xl p-5">
          <p className="text-sm text-muted font-medium">Monthly Bills</p>
          <p className="text-2xl font-bold mt-1">{formatCurrency(totalMonthly)}</p>
        </div>
        <div className="bg-card border border-card-border rounded-xl p-5">
          <p className="text-sm text-muted font-medium">Paid This Month</p>
          <p className="text-2xl font-bold mt-1 text-success">{formatCurrency(totalPaid)}</p>
        </div>
        <div className="bg-card border border-card-border rounded-xl p-5">
          <p className="text-sm text-muted font-medium">Remaining</p>
          <p className="text-2xl font-bold mt-1">{formatCurrency(totalRemaining)}</p>
        </div>
        <div className="bg-card border border-card-border rounded-xl p-5">
          <p className="text-sm text-muted font-medium">Bills</p>
          <p className="text-2xl font-bold mt-1">
            {paidBills.length}/{bills.length} paid
          </p>
        </div>
      </div>

      {/* Add bill form */}
      <div className="bg-card border border-card-border rounded-xl p-6">
        <h3 className="text-sm font-medium text-muted mb-4">Add Bill</h3>
        <AddBillForm />
      </div>

      {/* Overdue bills */}
      {overdueBills.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-danger flex items-center gap-2">
            <span className="w-2 h-2 bg-danger rounded-full" />
            Overdue ({overdueBills.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {overdueBills.map((bill) => (
              <BillCard key={bill.id} bill={bill} />
            ))}
          </div>
        </div>
      )}

      {/* Due soon */}
      {dueSoonBills.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-warning flex items-center gap-2">
            <span className="w-2 h-2 bg-warning rounded-full" />
            Due Soon ({dueSoonBills.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {dueSoonBills.map((bill) => (
              <BillCard key={bill.id} bill={bill} />
            ))}
          </div>
        </div>
      )}

      {/* Upcoming */}
      {upcomingBills.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted flex items-center gap-2">
            <span className="w-2 h-2 bg-muted rounded-full" />
            Upcoming ({upcomingBills.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {upcomingBills.map((bill) => (
              <BillCard key={bill.id} bill={bill} />
            ))}
          </div>
        </div>
      )}

      {/* Paid */}
      {paidBills.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-success flex items-center gap-2">
            <span className="w-2 h-2 bg-success rounded-full" />
            Paid ({paidBills.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {paidBills.map((bill) => (
              <BillCard key={bill.id} bill={bill} />
            ))}
          </div>
        </div>
      )}

      {bills.length === 0 && (
        <div className="bg-card border border-card-border rounded-xl p-8 text-center">
          <p className="text-muted text-sm">
            No bills added yet. Add your first bill above.
          </p>
        </div>
      )}
    </div>
  );
}
