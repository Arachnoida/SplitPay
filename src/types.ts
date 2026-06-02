export interface Contributor {
  id: string;
  name: string;
  shareAmount: number; // The amount they agree to pay
  paymentStatus: 'PENDING' | 'PAID' | 'FAILED';
  paidAt: string | null;
  transactionId?: string; // payment reference
}

export interface BillItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

export interface User {
  id: string;
  username: string; // email or unique handle
  name: string;
  passwordHash: string; // secure-looking representation for full-stack validation
  role: 'admin' | 'user'; // admin: full access | user: read-only, cannot create bill or access cashier
  createdAt: string;
}

export interface Bill {
  id: string;
  code: string; // friendly string like SB-3289 for easy joining
  title: string;
  description: string;
  totalAmount: number;
  items: BillItem[];
  status: 'CREATING' | 'SHARING' | 'LOCKED' | 'COMPLETED'; // CREATING (cashier workspace), SHARING (members join & adjust shares), LOCKED (invoices generated), COMPLETED (all paid)
  contributors: Contributor[];
  createdAt: string;
  creatorId?: string; // Links bill to authentic user creator
}

export interface SplitNotification {
  id: string;
  billId: string;
  billTitle: string;
  message: string;
  type: 'INFO' | 'PAYMENT_RECEIVED' | 'BILL_COMPLETED' | 'JOIN';
  timestamp: string;
}

export interface TransactionHistory {
  id: string;
  billId: string;
  billTitle: string;
  contributorName: string;
  amount: number;
  status: 'SUCCESS' | 'FAILED';
  timestamp: string;
  paymentMethod: string;
}