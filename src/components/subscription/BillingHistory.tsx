import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Receipt, DollarSign } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const BillingHistory: React.FC = () => {
  const { user } = useAuth();

  if (!user) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <p className="text-muted-foreground">Please sign in to view billing history.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Receipt className="w-5 h-5" />
          Billing History
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-center py-8">
          <DollarSign className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="font-semibold mb-2">No Transactions Found</h3>
          <p className="text-muted-foreground">
            Your billing history will appear here once billing is fully configured.
          </p>
          <Badge variant="secondary" className="mt-2">Coming Soon</Badge>
        </div>
      </CardContent>
    </Card>
  );
};

export default BillingHistory;