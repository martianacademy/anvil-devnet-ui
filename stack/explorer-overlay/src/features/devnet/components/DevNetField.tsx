// SPDX-License-Identifier: LicenseRef-Blockscout

import React from 'react';

import { Field } from 'src/toolkit/chakra/field';
import { Input } from 'src/toolkit/chakra/input';

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  helperText?: string;
  isMono?: boolean;
  isDisabled?: boolean;
  onBlur?: () => void;
}

/** Labelled text input — the DevNet forms are all just these. */
const DevNetField = ({ label, value, onChange, placeholder, helperText, isMono, isDisabled, onBlur }: Props) => {
  const handleChange = React.useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    onChange(event.target.value);
  }, [ onChange ]);

  return (
    <Field label={ label } helperText={ helperText } size="md" w="100%">
      <Input
        value={ value }
        onChange={ handleChange }
        onBlur={ onBlur }
        placeholder={ placeholder }
        disabled={ isDisabled }
        fontFamily={ isMono ? 'mono' : undefined }
        size="md"
      />
    </Field>
  );
};

export default DevNetField;
