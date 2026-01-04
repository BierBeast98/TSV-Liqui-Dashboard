import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Wallet } from "lucide-react";

export default function Login() {
  const handleLogin = () => {
    window.location.href = "/api/login";
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background relative overflow-hidden">
      {/* Abstract Background Shapes */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-3xl" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/5 rounded-full blur-3xl" />

      <Card className="w-full max-w-md mx-4 border-border/50 shadow-2xl bg-card/50 backdrop-blur-xl">
        <CardHeader className="text-center pb-2">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4 text-primary">
            <Wallet className="w-8 h-8" />
          </div>
          <CardTitle className="text-2xl font-display font-bold">Welcome Back</CardTitle>
          <CardDescription>
            Sign in to TSV Greding Finance Dashboard
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          <Button 
            className="w-full h-12 text-base rounded-xl shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all duration-300" 
            onClick={handleLogin}
          >
            Log in with Replit
          </Button>
          <p className="text-xs text-center text-muted-foreground px-8">
            Secure authentication powered by Replit. Your financial data is encrypted and safe.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
