import { useState } from "react";
import { useGetMe, useListDepartments, useListCategories, useListUsers, useCreateDepartment, useCreateCategory, useUpdateUserRole, getListDepartmentsQueryKey, getListCategoriesQueryKey, getListUsersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ShieldAlert, Plus, Users, Building, Tag } from "lucide-react";
import { format, parseISO } from "date-fns";

const departmentSchema = z.object({
  name: z.string().min(1, "Name is required"),
});

const categorySchema = z.object({
  name: z.string().min(1, "Name is required"),
});

export default function Organization() {
  const { data: me } = useGetMe();
  const isAdmin = me?.role === "admin";
  const queryClient = useQueryClient();

  const { data: departments, isLoading: isLoadingDepts } = useListDepartments();
  const { data: categories, isLoading: isLoadingCats } = useListCategories();
  const { data: users, isLoading: isLoadingUsers } = useListUsers();

  const createDept = useCreateDepartment();
  const createCat = useCreateCategory();
  const updateUserRole = useUpdateUserRole();

  const [deptOpen, setDeptOpen] = useState(false);
  const [catOpen, setCatOpen] = useState(false);

  const deptForm = useForm<z.infer<typeof departmentSchema>>({
    resolver: zodResolver(departmentSchema),
    defaultValues: { name: "" },
  });

  const catForm = useForm<z.infer<typeof categorySchema>>({
    resolver: zodResolver(categorySchema),
    defaultValues: { name: "" },
  });

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] text-center space-y-4">
        <ShieldAlert className="h-16 w-16 text-destructive" />
        <h2 className="text-2xl font-bold tracking-tight">RESTRICTED ACCESS</h2>
        <p className="text-muted-foreground font-mono text-sm uppercase max-w-md">
          Organization setup is restricted to administrative personnel. Your current clearance level ({me?.role}) does not grant access to this module.
        </p>
      </div>
    );
  }

  const onDeptSubmit = (values: z.infer<typeof departmentSchema>) => {
    createDept.mutate(
      { data: values },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListDepartmentsQueryKey() });
          setDeptOpen(false);
          deptForm.reset();
          toast.success("Department created");
        },
        onError: (err: any) => toast.error(err.message || "Failed to create department"),
      }
    );
  };

  const onCatSubmit = (values: z.infer<typeof categorySchema>) => {
    createCat.mutate(
      { data: values },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
          setCatOpen(false);
          catForm.reset();
          toast.success("Category created");
        },
        onError: (err: any) => toast.error(err.message || "Failed to create category"),
      }
    );
  };

  const handleRoleChange = (userId: number, newRole: string) => {
    updateUserRole.mutate(
      { id: userId, data: { role: newRole } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
          toast.success("Role updated");
        },
        onError: (err: any) => toast.error(err.message || "Failed to update role"),
      }
    );
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">ORGANIZATION SETUP</h1>
        <p className="text-muted-foreground font-mono text-sm mt-1 uppercase tracking-wider">Manage departments, categories, and personnel access</p>
      </div>

      <Tabs defaultValue="departments" className="w-full">
        <TabsList className="bg-black/20 mb-6 p-1 rounded-md border border-white/10">
          <TabsTrigger value="departments" className="font-mono uppercase tracking-wider data-[state=active]:bg-primary data-[state=active]:text-black rounded-sm"><Building className="h-4 w-4 mr-2" /> DEPARTMENTS</TabsTrigger>
          <TabsTrigger value="categories" className="font-mono uppercase tracking-wider data-[state=active]:bg-primary data-[state=active]:text-black rounded-sm"><Tag className="h-4 w-4 mr-2" /> CATEGORIES</TabsTrigger>
          <TabsTrigger value="employees" className="font-mono uppercase tracking-wider data-[state=active]:bg-primary data-[state=active]:text-black rounded-sm"><Users className="h-4 w-4 mr-2" /> PERSONNEL</TabsTrigger>
        </TabsList>

        <TabsContent value="departments" className="space-y-4 mt-0">
          <Card className="bg-card border-card-border">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Departments</CardTitle>
                <CardDescription>Organizational structure</CardDescription>
              </div>
              <Dialog open={deptOpen} onOpenChange={setDeptOpen}>
                <DialogTrigger asChild>
                  <Button className="font-mono uppercase tracking-wider text-xs"><Plus className="h-4 w-4 mr-1" /> New Department</Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px] border-border bg-card">
                  <DialogHeader>
                    <DialogTitle className="font-mono tracking-widest uppercase">CREATE DEPARTMENT</DialogTitle>
                  </DialogHeader>
                  <Form {...deptForm}>
                    <form onSubmit={deptForm.handleSubmit(onDeptSubmit)} className="space-y-4 mt-4">
                      <FormField
                        control={deptForm.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="font-mono text-xs uppercase tracking-wider">Department Name</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g. Engineering" {...field} className="bg-black/20" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="flex justify-end">
                        <Button type="submit" className="font-mono uppercase tracking-wider" disabled={createDept.isPending}>
                          {createDept.isPending ? "CREATING..." : "CREATE"}
                        </Button>
                      </div>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50 hover:bg-transparent">
                    <TableHead className="font-mono text-xs uppercase tracking-widest">ID</TableHead>
                    <TableHead className="font-mono text-xs uppercase tracking-widest">Name</TableHead>
                    <TableHead className="font-mono text-xs uppercase tracking-widest">Personnel</TableHead>
                    <TableHead className="font-mono text-xs uppercase tracking-widest">Status</TableHead>
                    <TableHead className="font-mono text-xs uppercase tracking-widest text-right">Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingDepts ? (
                    <TableRow><TableCell colSpan={5} className="text-center font-mono text-sm py-8 text-muted-foreground">LOADING...</TableCell></TableRow>
                  ) : departments?.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center font-mono text-sm py-8 text-muted-foreground">NO DEPARTMENTS</TableCell></TableRow>
                  ) : (
                    departments?.map((dept) => (
                      <TableRow key={dept.id} className="border-border/20 hover:bg-white/5">
                        <TableCell className="font-mono text-muted-foreground">#{dept.id}</TableCell>
                        <TableCell className="font-bold">{dept.name}</TableCell>
                        <TableCell className="font-mono">{dept.employeeCount || 0}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={dept.status === 'active' ? 'bg-primary/10 text-primary border-primary/20' : ''}>
                            {dept.status.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground text-sm font-mono">{format(parseISO(dept.createdAt), 'MMM d, yyyy')}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="categories" className="space-y-4 mt-0">
          <Card className="bg-card border-card-border">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Asset Categories</CardTitle>
                <CardDescription>Classification taxonomy</CardDescription>
              </div>
              <Dialog open={catOpen} onOpenChange={setCatOpen}>
                <DialogTrigger asChild>
                  <Button className="font-mono uppercase tracking-wider text-xs"><Plus className="h-4 w-4 mr-1" /> New Category</Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px] border-border bg-card">
                  <DialogHeader>
                    <DialogTitle className="font-mono tracking-widest uppercase">CREATE CATEGORY</DialogTitle>
                  </DialogHeader>
                  <Form {...catForm}>
                    <form onSubmit={catForm.handleSubmit(onCatSubmit)} className="space-y-4 mt-4">
                      <FormField
                        control={catForm.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="font-mono text-xs uppercase tracking-wider">Category Name</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g. Laptops" {...field} className="bg-black/20" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="flex justify-end">
                        <Button type="submit" className="font-mono uppercase tracking-wider" disabled={createCat.isPending}>
                          {createCat.isPending ? "CREATING..." : "CREATE"}
                        </Button>
                      </div>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50 hover:bg-transparent">
                    <TableHead className="font-mono text-xs uppercase tracking-widest w-[100px]">ID</TableHead>
                    <TableHead className="font-mono text-xs uppercase tracking-widest">Name</TableHead>
                    <TableHead className="font-mono text-xs uppercase tracking-widest text-right">Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingCats ? (
                    <TableRow><TableCell colSpan={3} className="text-center font-mono text-sm py-8 text-muted-foreground">LOADING...</TableCell></TableRow>
                  ) : categories?.length === 0 ? (
                    <TableRow><TableCell colSpan={3} className="text-center font-mono text-sm py-8 text-muted-foreground">NO CATEGORIES</TableCell></TableRow>
                  ) : (
                    categories?.map((cat) => (
                      <TableRow key={cat.id} className="border-border/20 hover:bg-white/5">
                        <TableCell className="font-mono text-muted-foreground">#{cat.id}</TableCell>
                        <TableCell className="font-bold">{cat.name}</TableCell>
                        <TableCell className="text-right text-muted-foreground text-sm font-mono">{format(parseISO(cat.createdAt), 'MMM d, yyyy')}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="employees" className="space-y-4 mt-0">
          <Card className="bg-card border-card-border">
            <CardHeader>
              <CardTitle>Personnel Roster</CardTitle>
              <CardDescription>System access and roles</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50 hover:bg-transparent">
                    <TableHead className="font-mono text-xs uppercase tracking-widest">Name</TableHead>
                    <TableHead className="font-mono text-xs uppercase tracking-widest">Email</TableHead>
                    <TableHead className="font-mono text-xs uppercase tracking-widest">Department</TableHead>
                    <TableHead className="font-mono text-xs uppercase tracking-widest">Role</TableHead>
                    <TableHead className="font-mono text-xs uppercase tracking-widest">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingUsers ? (
                    <TableRow><TableCell colSpan={5} className="text-center font-mono text-sm py-8 text-muted-foreground">LOADING...</TableCell></TableRow>
                  ) : (
                    users?.map((user) => (
                      <TableRow key={user.id} className="border-border/20 hover:bg-white/5">
                        <TableCell className="font-bold">{user.name}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{user.email}</TableCell>
                        <TableCell>{user.departmentName || <span className="text-muted-foreground italic text-sm">Unassigned</span>}</TableCell>
                        <TableCell>
                          <Select
                            defaultValue={user.role}
                            onValueChange={(val) => handleRoleChange(user.id, val)}
                            disabled={user.id === me?.id || updateUserRole.isPending}
                          >
                            <SelectTrigger className="w-[180px] h-8 text-xs font-mono bg-black/20 border-white/10">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-card border-border">
                              <SelectItem value="employee" className="font-mono text-xs">EMPLOYEE</SelectItem>
                              <SelectItem value="department_head" className="font-mono text-xs text-accent">DEPT HEAD</SelectItem>
                              <SelectItem value="asset_manager" className="font-mono text-xs text-primary">ASSET MGR</SelectItem>
                              <SelectItem value="admin" className="font-mono text-xs text-destructive">ADMIN</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={
                            user.status === 'active' ? 'bg-primary/10 text-primary border-primary/20' : 
                            user.status === 'suspended' ? 'bg-destructive/10 text-destructive border-destructive/20' : ''
                          }>
                            {user.status.toUpperCase()}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}