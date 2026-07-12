import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLogin, useSignup, useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Activity } from "lucide-react";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

const signupSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string().min(6, "Confirm password is required"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export default function Auth() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: user } = useGetMe();

  const loginMutation = useLogin();
  const signupMutation = useSignup();

  useEffect(() => {
    if (user) {
      setLocation("/dashboard");
    }
  }, [user, setLocation]);

  const loginForm = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const signupForm = useForm<z.infer<typeof signupSchema>>({
    resolver: zodResolver(signupSchema),
    defaultValues: { name: "", email: "", password: "", confirmPassword: "" },
  });

  const onLogin = (values: z.infer<typeof loginSchema>) => {
    loginMutation.mutate(
      { data: values },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          setLocation("/dashboard");
        },
        onError: (err: any) => {
          toast.error(err?.message || "Login failed");
        },
      }
    );
  };

  const onSignup = (values: z.infer<typeof signupSchema>) => {
    const { confirmPassword, ...signupData } = values;
    signupMutation.mutate(
      { data: signupData },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          setLocation("/dashboard");
        },
        onError: (err: any) => {
          toast.error(err?.message || "Signup failed");
        },
      }
    );
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="flex items-center gap-3 mb-8 text-primary font-mono tracking-widest text-2xl font-bold">
        <Activity className="h-8 w-8" />
        ASSETFLOW
      </div>
      
      <Card className="w-full max-w-md bg-card border-card-border shadow-2xl">
        <CardHeader>
          <CardTitle className="text-2xl text-center tracking-tight">System Access</CardTitle>
          <CardDescription className="text-center text-muted-foreground font-mono text-xs uppercase tracking-wider mt-2">
            Enterprise Asset & Resource Management
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6 bg-black/20">
              <TabsTrigger value="login" className="font-mono tracking-wider">LOGIN</TabsTrigger>
              <TabsTrigger value="signup" className="font-mono tracking-wider">SIGNUP</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <Form {...loginForm}>
                <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-4">
                  <FormField
                    control={loginForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-xs text-muted-foreground tracking-wider uppercase">Email</FormLabel>
                        <FormControl>
                          <Input placeholder="operator@enterprise.com" {...field} className="bg-black/20 border-white/10 focus-visible:ring-primary focus-visible:border-primary" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={loginForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center justify-between">
                          <FormLabel className="font-mono text-xs text-muted-foreground tracking-wider uppercase">Password</FormLabel>
                          <a href="#" onClick={(e) => { e.preventDefault(); toast.info("Password reset flow is not implemented in this demo."); }} className="text-xs text-primary hover:underline font-mono tracking-wider">
                            Forgot Password?
                          </a>
                        </div>
                        <FormControl>
                          <Input type="password" {...field} className="bg-black/20 border-white/10 focus-visible:ring-primary focus-visible:border-primary" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full font-mono tracking-widest font-bold mt-6 h-12 hover-elevate bg-primary text-black hover:bg-primary/90" disabled={loginMutation.isPending}>
                    {loginMutation.isPending ? "AUTHENTICATING..." : "AUTHENTICATE"}
                  </Button>
                </form>
              </Form>
            </TabsContent>

            <TabsContent value="signup">
              <Form {...signupForm}>
                <form onSubmit={signupForm.handleSubmit(onSignup)} className="space-y-4">
                  <FormField
                    control={signupForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-xs text-muted-foreground tracking-wider uppercase">Full Name</FormLabel>
                        <FormControl>
                          <Input placeholder="John Doe" {...field} className="bg-black/20 border-white/10 focus-visible:ring-primary focus-visible:border-primary" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={signupForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-xs text-muted-foreground tracking-wider uppercase">Email</FormLabel>
                        <FormControl>
                          <Input placeholder="operator@enterprise.com" {...field} className="bg-black/20 border-white/10 focus-visible:ring-primary focus-visible:border-primary" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={signupForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-xs text-muted-foreground tracking-wider uppercase">Password</FormLabel>
                        <FormControl>
                          <Input type="password" {...field} className="bg-black/20 border-white/10 focus-visible:ring-primary focus-visible:border-primary" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={signupForm.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-xs text-muted-foreground tracking-wider uppercase">Confirm Password</FormLabel>
                        <FormControl>
                          <Input type="password" {...field} className="bg-black/20 border-white/10 focus-visible:ring-primary focus-visible:border-primary" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full font-mono tracking-widest font-bold mt-6 h-12 hover-elevate bg-white text-black hover:bg-white/90" disabled={signupMutation.isPending}>
                    {signupMutation.isPending ? "REGISTERING..." : "REGISTER"}
                  </Button>
                </form>
              </Form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}