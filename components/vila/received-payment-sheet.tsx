import { AppButton, ChoiceField, ErrorText, Field } from "@/components/vila/ui";
import { FormSheet } from "@/components/vila/form-sheet";
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/shared/vila";

type PaidMethod = Exclude<PaymentMethod, "package">;

const paymentOptions = (["pix", "cash", "card"] as const).map((value) => ({ value, label: PAYMENT_METHOD_LABELS[value] }));

type ReceivedPaymentSheetProps = {
  visible: boolean;
  title: string;
  subtitle: string;
  amount: string;
  onAmountChange: (value: string) => void;
  method?: PaidMethod;
  onMethodChange?: (value: PaidMethod) => void;
  error?: string | null;
  loading?: boolean;
  buttonLabel?: string;
  onSubmit: () => void;
  onClose: () => void;
};

export function ReceivedPaymentSheet({
  visible,
  title,
  subtitle,
  amount,
  onAmountChange,
  method,
  onMethodChange,
  error,
  loading = false,
  buttonLabel = "Registrar recebimento",
  onSubmit,
  onClose,
}: ReceivedPaymentSheetProps) {
  return (
    <FormSheet visible={visible} title={title} subtitle={subtitle} onClose={onClose}>
      <Field label="Valor recebido (R$) *" value={amount} onChangeText={onAmountChange} placeholder="0,00" keyboardType="decimal-pad" autoCapitalize="none" />
      {method && onMethodChange ? <ChoiceField label="Forma de recebimento *" value={method} options={paymentOptions} onChange={onMethodChange} /> : null}
      <ErrorText message={error} />
      <AppButton label={buttonLabel} onPress={onSubmit} loading={loading} />
    </FormSheet>
  );
}
