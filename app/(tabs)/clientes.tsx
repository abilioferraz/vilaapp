import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AppButton, AppHeader, ChoiceField, EmptyState, ErrorText, Field, Panel, SectionHeading, StatusPill, uiStyles } from "@/components/vila/ui";
import { FormSheet } from "@/components/vila/form-sheet";
import { BRAND, SIZE_LABELS, SPECIES_LABELS, type PetSize, type Species } from "@/shared/vila";
import { trpc } from "@/lib/trpc";

type ClientItem = { id: number; name: string; phone: string | null; address: string | null; email: string | null; pets: { id: number; name: string; species: Species; breed: string | null; size: PetSize; notes: string | null }[] };

function normalizeSearch(value: string) {
  return value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ");
}

export default function ClientsScreen() {
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [petOpen, setPetOpen] = useState(false);
  const [active, setActive] = useState<ClientItem | null>(null);
  const [editingPet, setEditingPet] = useState<ClientItem["pets"][number] | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [petName, setPetName] = useState("");
  const [species, setSpecies] = useState<Species>("dog");
  const [size, setSize] = useState<PetSize>("medium");
  const [breed, setBreed] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const utils = trpc.useUtils();
  const list = trpc.vila.clients.list.useQuery(undefined);
  const create = trpc.vila.clients.create.useMutation({ onSuccess: () => { void utils.vila.clients.list.invalidate(); closeForm(); } });
  const update = trpc.vila.clients.update.useMutation({ onSuccess: () => { void utils.vila.clients.list.invalidate(); closeForm(); } });
  const archive = trpc.vila.clients.archive.useMutation({ onSuccess: () => void utils.vila.clients.list.invalidate() });
  const addPet = trpc.vila.clients.addPet.useMutation({ onSuccess: () => { void utils.vila.clients.list.invalidate(); closePet(); } });
  const updatePet = trpc.vila.clients.updatePet.useMutation({ onSuccess: () => { void utils.vila.clients.list.invalidate(); closePet(); } });
  const searchKey = normalizeSearch(search);
  const filtered = ((list.data || []) as ClientItem[]).filter((client) => !searchKey || normalizeSearch([client.name, client.phone, client.email].filter(Boolean).join(" ")).includes(searchKey));

  function closeForm() { setFormOpen(false); setError(""); setActive(null); }
  function openNew() { setActive(null); setName(""); setPhone(""); setEmail(""); setAddress(""); setError(""); setFormOpen(true); }
  function openEdit(client: ClientItem) { setActive(client); setName(client.name); setPhone(client.phone || ""); setEmail(client.email || ""); setAddress(client.address || ""); setError(""); setFormOpen(true); }
  function closePet() { setPetOpen(false); setEditingPet(null); setPetName(""); setBreed(""); setNotes(""); setError(""); }
  function editPet(client: ClientItem, pet: ClientItem["pets"][number]) { setActive(client); setEditingPet(pet); setPetName(pet.name); setSpecies(pet.species); setSize(pet.size); setBreed(pet.breed || ""); setNotes(pet.notes || ""); setError(""); setPetOpen(true); }
  function saveClient() {
    setError("");
    if (!name.trim()) { setError("Informe o nome do tutor."); return; }
    const input = { name: name.trim(), phone: phone.trim() || undefined, email: email.trim(), address: address.trim() || undefined };
    if (active) update.mutate({ id: active.id, ...input }); else create.mutate(input);
  }
  function confirmArchive(client: ClientItem) {
    const apply = () => archive.mutate({ id: client.id });
    if (typeof window !== "undefined" && typeof window.confirm === "function") {
      if (window.confirm(`Arquivar ${client.name}? O histórico será preservado.`)) apply();
    } else Alert.alert("Arquivar tutor", `Arquivar ${client.name}? O histórico será preservado.`, [{ text: "Manter", style: "cancel" }, { text: "Arquivar", style: "destructive", onPress: apply }]);
  }
  function savePet() {
    if (!active || !petName.trim()) { setError("Informe o nome do pet."); return; }
    const input = { clientId: active.id, name: petName.trim(), species, size, breed: breed.trim() || undefined, notes: notes.trim() || undefined };
    if (editingPet) updatePet.mutate({ id: editingPet.id, ...input }, { onError: (e) => setError(e.message) });
    else addPet.mutate(input, { onError: (e) => setError(e.message) });
  }
  const saving = create.isPending || update.isPending;

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AppHeader eyebrow="Relacionamento com tutores" title="Clientes & AUmigos" right={<View style={styles.count}><Text style={styles.countNumber}>{list.data?.length ?? "—"}</Text><Text style={styles.countLabel}>TUTORES</Text></View>} />
        <View style={styles.toolbar}><View style={styles.searchWrap}><Field label="Buscar tutor" value={search} onChangeText={setSearch} placeholder="Nome do tutor…" autoCapitalize="none" /></View><AppButton label="+ Tutor" onPress={openNew} style={styles.addButton} /></View>
        <SectionHeading title="Sua comunidade" detail="Cada tutor pode ter vários pets cadastrados." />
        {list.isLoading ? <ActivityIndicator color={BRAND.orange} style={{ marginTop: 24 }} /> : list.error ? <Panel><Text style={uiStyles.bodyText}>Não foi possível carregar clientes. Verifique a conexão e tente novamente.</Text></Panel> : filtered.length === 0 ? <EmptyState title={search ? "Nenhum tutor encontrado" : "Sua lista começa aqui"} body={search ? "Tente buscar por outro nome." : "Cadastre um tutor para adicionar seus pets e organizar os próximos cuidados."} /> : filtered.map((client) => (
          <Panel key={client.id} style={styles.clientCard}>
            <View style={styles.clientHead}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{client.name.trim().slice(0, 1).toUpperCase()}</Text></View>
              <View style={{ flex: 1 }}><Text style={styles.clientName}>{client.name}</Text><Text style={styles.clientSub}>{client.phone || "Telefone não informado"}</Text></View>
              <Pressable onPress={() => openEdit(client)} style={styles.more}><Text style={styles.moreText}>Editar</Text></Pressable>
            </View>
            {client.email ? <Text style={styles.contact}>{client.email}</Text> : null}
            {client.address ? <Text style={styles.contact}>{client.address}</Text> : null}
            <View style={styles.petHeading}><Text style={styles.petHeadingText}>PETS DA FAMÍLIA</Text><StatusPill label={`${client.pets.length} ${client.pets.length === 1 ? "pet" : "pets"}`} /></View>
            {client.pets.length ? <View style={{ gap: 8 }}>{client.pets.map((pet) => <View key={pet.id} style={styles.petRow}><View style={styles.petEmoji}><Text>{pet.species === "dog" ? "🐶" : pet.species === "cat" ? "🐱" : "🐰"}</Text></View><View style={{ flex: 1 }}><Text style={styles.petName}>{pet.name}</Text><Text style={styles.petInfo}>{[SPECIES_LABELS[pet.species], pet.breed, SIZE_LABELS[pet.size]].filter(Boolean).join(" · ")}</Text>{pet.notes ? <Text style={styles.petNotes}>{pet.notes}</Text> : null}</View><Pressable onPress={() => editPet(client, pet)} hitSlop={8}><Text style={styles.petEdit}>Editar</Text></Pressable></View>)}</View> : <Text style={styles.noPets}>Nenhum pet cadastrado ainda.</Text>}
            <View style={styles.cardActions}><AppButton label="+ Adicionar pet" variant="secondary" onPress={() => { setActive(client); setPetName(""); setError(""); setPetOpen(true); }} style={{ flex: 1 }} /><AppButton label="Arquivar" variant="quiet" onPress={() => confirmArchive(client)} /></View>
          </Panel>
        ))}
      </ScrollView>

      <FormSheet visible={formOpen} title={active ? "Editar tutor" : "Novo tutor"} subtitle="Dados do responsável pelos AUmigos" onClose={closeForm}>
        <Field label="Nome completo *" value={name} onChangeText={setName} placeholder="Ex.: Maria Oliveira" autoCapitalize="words" />
        <Field label="Telefone / WhatsApp" value={phone} onChangeText={setPhone} placeholder="(19) 99999-9999" keyboardType="phone-pad" />
        <Field label="E-mail" value={email} onChangeText={setEmail} placeholder="nome@email.com" keyboardType="email-address" autoCapitalize="none" />
        <Field label="Endereço" value={address} onChangeText={setAddress} placeholder="Rua, número, bairro" autoCapitalize="words" />
        <ErrorText message={error || create.error?.message || update.error?.message} />
        <AppButton label={active ? "Salvar alterações" : "Cadastrar tutor"} onPress={saveClient} loading={saving} />
      </FormSheet>

      <FormSheet visible={petOpen} title={editingPet ? "Editar AUmigo" : "Adicionar AUmigo"} subtitle={active ? `Tutor: ${active.name}` : undefined} onClose={closePet}>
        <Field label="Nome do pet *" value={petName} onChangeText={setPetName} placeholder="Ex.: Toby" autoCapitalize="words" />
        <ChoiceField label="Espécie" value={species} options={[{ value: "dog", label: "Cão" }, { value: "cat", label: "Gato" }, { value: "rabbit", label: "Coelho" }]} onChange={setSpecies} />
        <Field label="Raça" value={breed} onChangeText={setBreed} placeholder="Raça ou sem raça definida" autoCapitalize="words" />
        <ChoiceField label="Porte" value={size} options={[{ value: "small", label: "Pequeno" }, { value: "medium", label: "Médio" }, { value: "large", label: "Grande" }, { value: "special", label: "Especial" }]} onChange={setSize} />
        <Field label="Observações importantes" value={notes} onChangeText={setNotes} placeholder="Cuidados, comportamento, alergias…" multiline />
        <ErrorText message={error || addPet.error?.message || updatePet.error?.message} />
        <AppButton label={editingPet ? "Salvar alterações" : "Salvar pet"} onPress={savePet} loading={addPet.isPending || updatePet.isPending} />
      </FormSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: BRAND.background }, content: { paddingBottom: 32 },
  count: { alignItems: "flex-end" }, countNumber: { color: BRAND.orange, fontWeight: "900", fontSize: 20 }, countLabel: { color: BRAND.muted, fontWeight: "800", fontSize: 9, letterSpacing: 1 },
  toolbar: { flexDirection: "row", alignItems: "flex-end", gap: 10, paddingHorizontal: 20, marginBottom: 20 }, searchWrap: { flex: 1, minWidth: 0 }, addButton: { minWidth: 92, minHeight: 48, paddingHorizontal: 10 },
  clientCard: { marginHorizontal: 20, marginBottom: 12, padding: 15 }, clientHead: { flexDirection: "row", alignItems: "center", gap: 11 }, avatar: { width: 42, height: 42, borderRadius: 15, backgroundColor: "#533B25", alignItems: "center", justifyContent: "center" }, avatarText: { color: BRAND.orange, fontWeight: "900", fontSize: 17 }, clientName: { color: BRAND.cream, fontWeight: "800", fontSize: 15 }, clientSub: { color: BRAND.muted, marginTop: 3, fontSize: 12 }, more: { borderRadius: 9, backgroundColor: BRAND.surfaceAlt, paddingHorizontal: 10, paddingVertical: 7 }, moreText: { color: BRAND.teal, fontSize: 11, fontWeight: "800" },
  contact: { color: BRAND.muted, fontSize: 12, marginTop: 7, marginLeft: 53 }, petHeading: { borderTopWidth: 1, borderTopColor: BRAND.border, marginTop: 14, paddingTop: 12, marginBottom: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, petHeadingText: { color: BRAND.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1.2 }, petRow: { flexDirection: "row", gap: 10, alignItems: "center", backgroundColor: BRAND.background, borderRadius: 13, padding: 10 }, petEmoji: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: BRAND.surface }, petName: { color: BRAND.cream, fontWeight: "800", fontSize: 13 }, petInfo: { color: BRAND.muted, fontSize: 11, marginTop: 3 }, petNotes: { color: BRAND.teal, fontSize: 11, marginTop: 3 }, petEdit: { color: BRAND.teal, fontSize: 10, fontWeight: "800" }, noPets: { color: BRAND.muted, fontSize: 12, paddingVertical: 4 }, cardActions: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
});
