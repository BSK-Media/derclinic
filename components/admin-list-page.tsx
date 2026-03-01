"use client";

import * as React from "react";
import useSWR from "swr";
import { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const fetcher = (u: string) => fetch(u).then((r) => r.json());

type Props = { title: string; endpoint: string; columns: ColumnDef<any, any>[]; renderForm: (ctx: any) => React.ReactNode };

export function AdminListPage({ title, endpoint, columns, renderForm }: Props) {
  const { data, mutate, isLoading } = useSWR(endpoint, fetcher);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{title}</CardTitle>
        <Dialog>
          <DialogTrigger asChild><Button>Dodaj</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Dodaj</DialogTitle></DialogHeader>
            {renderForm({ onDone: async () => { await mutate(); toast.success("Zapisano"); } })}
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {isLoading ? <div className="text-zinc-500">Ładowanie…</div> : <DataTable data={data ?? []} columns={columns} />}
      </CardContent>
    </Card>
  );
}
